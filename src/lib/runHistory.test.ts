import { describe, expect, it } from 'vitest'
import { isSameDirectory, parseSts2Run, type HistoryDirectoryHandle } from './runHistory'

const rawRun = JSON.stringify({
  ascension: 4,
  seed: 'TESTSEED',
  build_id: 'v0.107.1',
  run_time: 1800,
  acts: ['ACT.OVERGROWTH'],
  start_time: 1770000000,
  win: false,
  was_abandoned: false,
  killed_by_encounter: 'ENCOUNTER.SLUDGE_SPINNER_WEAK',
  players: [{
    id: 1,
    character: 'CHARACTER.NECROBINDER',
    deck: [{ id: 'CARD.STRIKE_NECROBINDER', floor_added_to_deck: 1 }, { id: 'CARD.WISP', floor_added_to_deck: 3, current_upgrade_level: 1 }],
    relics: [{ id: 'RELIC.BONE_TEA', floor_added_to_deck: 5 }],
    potions: [],
  }],
  map_point_history: [[
    { map_point_type: 'monster', rooms: [{ room_type: 'monster', model_id: 'ENCOUNTER.SEAPUNK_WEAK', turns_taken: 4 }], player_stats: [{ player_id: 1, current_hp: 55, max_hp: 70, current_gold: 115, damage_taken: 9, gold_gained: 15, potion_choices: [{ choice: 'POTION.WEAK_POTION', was_picked: true }] }] },
    { map_point_type: 'monster', rooms: [{ room_type: 'monster', model_id: 'ENCOUNTER.SLUDGE_SPINNER_WEAK', turns_taken: 5 }], player_stats: [{ player_id: 1, current_hp: 48, max_hp: 70, card_choices: [{ card: { id: 'CARD.WISP' }, was_picked: true }, { card: { id: 'CARD.DEFY' }, was_picked: false }] }] },
  ]],
})

const ownerSteamId = '76561198000000001'
const friendSteamId = '76561198000000002'

function multiplayerRun() {
  const value = JSON.parse(rawRun)
  value.players = [
    { ...value.players[0], id: '__FRIEND__', character: 'CHARACTER.SILENT', deck: [{ id: 'CARD.BACKSTAB', floor_added_to_deck: 1 }], relics: [{ id: 'RELIC.RING_OF_THE_SNAKE', floor_added_to_deck: 1 }] },
    { ...value.players[0], id: '__OWNER__', character: 'CHARACTER.DEFECT', deck: [{ id: 'CARD.ZAP', floor_added_to_deck: 1 }], relics: [{ id: 'RELIC.CRACKED_CORE', floor_added_to_deck: 1 }], potions: [{ id: 'POTION.FIRE_POTION' }] },
  ]
  value.map_point_history = [[{
    player_stats: [
      { player_id: '__FRIEND__', cards_gained: [{ id: 'CARD.DAGGER_THROW' }] },
      { player_id: '__OWNER__', cards_gained: [{ id: 'CARD.BALL_LIGHTNING' }], potion_choices: [{ choice: 'POTION.FIRE_POTION', was_picked: true }] },
    ],
  }]]
  return JSON.stringify(value)
    .replaceAll('"__FRIEND__"', friendSteamId)
    .replaceAll('"__OWNER__"', ownerSteamId)
}

describe('Slay the Spire 2 run parser', () => {
  it('recognizes when normal and modded connections use the same directory', async () => {
    const first = { isSameEntry: async (other: HistoryDirectoryHandle) => other === second } as HistoryDirectoryHandle
    const second = {} as HistoryDirectoryHandle
    expect(await isSameDirectory(first, second)).toBe(true)
    expect(await isSameDirectory(first, {} as HistoryDirectoryHandle)).toBe(false)
  })

  it('maps a normal run into the strategy model', () => {
    const run = parseSts2Run(rawRun, '1770000000.run', 'normal')
    expect(run).toMatchObject({
      id: 'sts2:normal:1770000000',
      character: 'Necrobinder',
      ascension: 4,
      outcome: 'loss',
      floor: 2,
      source: 'normal',
      killedBy: 'Sludge Spinner Weak',
      cards: [{ name: 'Strike', floor: 1 }, { name: 'Wisp', floor: 3, upgraded: true }],
      relics: [{ name: 'Bone Tea', floor: 5 }],
      potions: ['Weak Potion'],
      finalPotions: [],
      mode: 'singleplayer',
      playerCount: 1,
      seed: 'TESTSEED',
      buildId: 'v0.107.1',
      acts: ['Overgrowth'],
      durationSeconds: 1800,
    })
    expect(run.nodes?.[1]).toMatchObject({ floor: 2, act: 1, actName: 'Overgrowth', encounter: 'Sludge Spinner Weak', turns: 5, cardChoices: [{ name: 'Wisp', picked: true }, { name: 'Defy', picked: false }] })
  })

  it('keeps normal and modded imports distinct', () => {
    expect(parseSts2Run(rawRun, '1770000000.run', 'modded')).toMatchObject({ id: 'sts2:modded:1770000000', source: 'modded' })
  })

  it('classifies co-op from player count rather than game_mode', () => {
    const run = parseSts2Run(multiplayerRun(), '1770000000.run', 'normal', ownerSteamId)
    expect(run).toMatchObject({ mode: 'multiplayer', playerCount: 2, steamPlayerSelected: true })
  })

  it('uses only the signed-in Steam player throughout a multiplayer run', () => {
    const run = parseSts2Run(multiplayerRun(), '1770000000.run', 'modded', ownerSteamId)
    expect(run).toMatchObject({
      source: 'modded',
      character: 'Defect',
      steamPlayerSelected: true,
      cards: [{ name: 'Zap', floor: 1 }],
      relics: [{ name: 'Cracked Core', floor: 1 }],
      finalPotions: ['Fire Potion'],
    })
    expect(run.cardsEverOwned).toEqual(expect.arrayContaining(['Zap', 'Ball Lightning']))
    expect(run.cardsEverOwned).not.toEqual(expect.arrayContaining(['Backstab', 'Dagger Throw']))
    expect(run.potions).toEqual(['Fire Potion'])
  })

  it('never falls back to a friend when the signed-in Steam player is absent', () => {
    expect(() => parseSts2Run(multiplayerRun(), '1770000000.run', 'normal', '76561198000000003')).toThrow(/Signed-in Steam player/)
  })

  it('keeps cards removed or transformed during the run in signal history', () => {
    const value = JSON.parse(rawRun)
    value.players[0].deck = [{ id: 'CARD.WISP', floor_added_to_deck: 3 }]
    value.map_point_history[0][1].player_stats[0] = {
      player_id: 1,
      cards_gained: [{ id: 'CARD.BLOOD_WALL' }],
      cards_removed: [{ id: 'CARD.STRIKE_NECROBINDER', floor_added_to_deck: 1 }],
      cards_transformed: [{ original_card: { id: 'CARD.BYRDONIS_EGG' }, final_card: { id: 'CARD.BYRD_SWOOP' } }],
      card_choices: [{ card: { id: 'CARD.DARKNESS' }, was_picked: true }, { card: { id: 'CARD.DEFY' }, was_picked: false }],
    }
    const run = parseSts2Run(JSON.stringify(value), '1770000000.run', 'normal')
    expect(run.cards.map((card) => card.name)).toEqual(['Wisp'])
    expect(run.cardsEverOwned).toEqual(expect.arrayContaining(['Wisp', 'Blood Wall', 'Strike', 'Byrdonis Egg', 'Byrd Swoop', 'Darkness']))
    expect(run.cardsEverOwned).not.toContain('Defy')
    expect(run.cardsRemovedDuringRun).toEqual(['Strike', 'Byrdonis Egg'])
  })

  it('records a same-floor relic exchange and keeps only the replacement in final inventory', () => {
    const value = JSON.parse(rawRun)
    value.players[0].relics = [{ id: 'RELIC.GREMLIN_HORN', floor_added_to_deck: 2 }]
    value.map_point_history[0][1] = {
      map_point_type: 'unknown',
      rooms: [{ model_id: 'EVENT.RELIC_TRADER' }],
      player_stats: [{
        player_id: 1,
        relics_removed: ['RELIC.AMETHYST_AUBERGINE'],
        relic_choices: [{ choice: 'RELIC.GREMLIN_HORN', was_picked: true }],
      }],
    }
    const run = parseSts2Run(JSON.stringify(value), '1770000000.run', 'normal')
    expect(run.relics).toEqual([{ name: 'Gremlin Horn', floor: 2, upgraded: undefined }])
    expect(run.relicChanges).toEqual([{ floor: 2, removed: ['Amethyst Aubergine'], gained: ['Gremlin Horn'], context: 'Relic Trader' }])
  })

  it('tracks card and potion changes separately from final inventories', () => {
    const value = JSON.parse(rawRun)
    value.players[0].deck = [{ id: 'CARD.WISP', floor_added_to_deck: 2, current_upgrade_level: 1 }]
    value.players[0].potions = [{ id: 'POTION.FIRE_POTION' }, { id: 'POTION.FIRE_POTION' }]
    value.map_point_history[0][1] = {
      rooms: [{ model_id: 'EVENT.RELIC_TRADER' }],
      player_stats: [{
        player_id: 1,
        cards_gained: [{ id: 'CARD.WISP' }],
        card_choices: [{ card: { id: 'CARD.WISP' }, was_picked: true }],
        cards_removed: [{ id: 'CARD.STRIKE_NECROBINDER' }],
        cards_transformed: [{ original_card: { id: 'CARD.OLD_CARD' }, final_card: { id: 'CARD.NEW_CARD' } }],
        upgraded_cards: ['CARD.WISP'],
        potion_choices: [{ choice: 'POTION.FIRE_POTION', was_picked: true }],
        potion_used: ['POTION.WEAK_POTION'],
        potion_discarded: ['POTION.SPEED_POTION'],
      }],
    }
    const run = parseSts2Run(JSON.stringify(value), '1770000000.run', 'modded')
    expect(run.cards).toHaveLength(1)
    expect(run.cardChanges).toContainEqual({ floor: 2, gained: ['Wisp'], removed: ['Strike'], transformed: [{ from: 'Old Card', to: 'New Card' }], upgraded: ['Wisp'], context: 'Relic Trader' })
    expect(run.finalPotions).toEqual(['Fire Potion', 'Fire Potion'])
    expect(run.potionChanges).toContainEqual({ floor: 2, gained: ['Fire Potion'], used: ['Weak Potion'], discarded: ['Speed Potion'], context: 'Relic Trader' })
  })

  it('rejects unsupported modded characters without breaking other imports', () => {
    const unknown = rawRun.replace('CHARACTER.NECROBINDER', 'CHARACTER.CUSTOM_HERO')
    expect(() => parseSts2Run(unknown, 'run.run', 'modded')).toThrow(/Unsupported character/)
  })
})
