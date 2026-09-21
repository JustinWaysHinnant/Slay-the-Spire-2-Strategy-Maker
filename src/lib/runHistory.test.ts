import { describe, expect, it } from 'vitest'
import { parseSts2Run } from './runHistory'

const rawRun = JSON.stringify({
  ascension: 4,
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
    { player_stats: [{ player_id: 1, potion_choices: [{ choice: 'POTION.WEAK_POTION', was_picked: true }] }] },
    { player_stats: [{ player_id: 1 }] },
  ]],
})

describe('Slay the Spire 2 run parser', () => {
  it('maps a normal run into the strategy model', () => {
    const run = parseSts2Run(rawRun, '1770000000.run', 'normal')
    expect(run).toMatchObject({
      id: 'sts2:normal:1770000000',
      character: 'Necrobinder',
      ascension: 4,
      outcome: 'loss',
      floor: 2,
      killedBy: 'Sludge Spinner Weak',
      cards: [{ name: 'Strike', floor: 1 }, { name: 'Wisp', floor: 3, upgraded: true }],
      relics: [{ name: 'Bone Tea', floor: 5 }],
      potions: ['Weak Potion'],
      finalPotions: [],
    })
  })

  it('keeps normal and modded imports distinct', () => {
    expect(parseSts2Run(rawRun, '1770000000.run', 'modded').id).toBe('sts2:modded:1770000000')
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
