import { useState, type FormEvent } from 'react'
import { CARD_EFFECT_GROUPS, POTIONS } from '../lib/gameData'
import { CHARACTERS, type Outcome, type Pickup, type Run } from '../lib/types'

interface Props { onAdd: (run: Run) => void }
const parseNames = (text: string): Pickup[] => text.split(/\n|,/).map((name) => name.trim()).filter(Boolean).map((name) => ({ name }))

function ChoicePicker({ label, options, value, onChange, grouped = false, wide = false }: {
  label: string
  options: readonly string[] | typeof CARD_EFFECT_GROUPS
  value: string[]
  onChange: (value: string[]) => void
  grouped?: boolean
  wide?: boolean
}) {
  function add(choice: string) {
    if (choice && !value.includes(choice)) onChange([...value, choice])
  }
  return <fieldset className={`choice-picker${wide ? ' wide' : ''}`}>
    <legend>{label}</legend>
    <select aria-label={`Add ${label.toLowerCase()}`} value="" onChange={(event) => add(event.target.value)}>
      <option value="">Choose an option…</option>
      {grouped
        ? (options as typeof CARD_EFFECT_GROUPS).map((group) => <optgroup label={group.label} key={group.label}>{group.options.map((option) => <option key={option}>{option}</option>)}</optgroup>)
        : (options as readonly string[]).map((option) => <option key={option}>{option}</option>)}
    </select>
    {value.length > 0 && <div className="choice-list">{value.map((choice) => <span className="choice" key={choice}>{choice}<button type="button" onClick={() => onChange(value.filter((item) => item !== choice))} aria-label={`Remove ${choice}`}>×</button></span>)}</div>}
  </fieldset>
}

export function RunForm({ onAdd }: Props) {
  const [cards, setCards] = useState<Pickup[]>([])
  const [relics, setRelics] = useState('')
  const [potions, setPotions] = useState<string[]>([])
  const [outcome, setOutcome] = useState<Outcome>('loss')
  const today = new Date().toISOString().slice(0, 10)
  function updateCard(index: number, patch: Partial<Pickup>) {
    setCards(cards.map((card, cardIndex) => cardIndex === index ? { ...card, ...patch } : card))
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onAdd({
      id: crypto.randomUUID(), date: String(data.get('date')), character: String(data.get('character')) as Run['character'],
      ascension: Number(data.get('ascension')), outcome, floor: Number(data.get('floor')), killedBy: String(data.get('killedBy') ?? '').trim() || undefined,
      cards: cards.map((card) => ({ ...card, name: card.name.trim(), effects: card.effects?.length ? card.effects : undefined })), relics: parseNames(relics), potions, notes: String(data.get('notes') ?? '').trim() || undefined,
    })
    event.currentTarget.reset(); setCards([]); setRelics(''); setPotions([]); setOutcome('loss')
  }
  return <section className="panel form-panel">
    <div className="section-heading"><div><p className="eyebrow">New record</p><h2>Log a run</h2></div><p className="hint">Add each card separately to record its floor, upgrade, and effects.</p></div>
    <form onSubmit={submit} className="run-form">
      <label>Date<input name="date" type="date" defaultValue={today} required /></label>
      <label>Character<select name="character">{CHARACTERS.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Ascension<input name="ascension" type="number" min="0" max="20" defaultValue="0" required /></label>
      <label>Outcome<select name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>{(['win', 'loss', 'abandoned'] as const).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Final floor<input name="floor" type="number" min="0" defaultValue="1" required /></label>
      <label>Defeated by<input name="killedBy" disabled={outcome !== 'loss'} placeholder="Enemy or boss" /></label>
      <fieldset className="card-builder wide">
        <legend>Cards</legend>
        {cards.length === 0 && <p className="picker-empty">No cards added yet.</p>}
        <div className="card-editor-list">{cards.map((card, index) => <div className="card-editor" key={index}>
          <label>Card name<input value={card.name} onChange={(event) => updateCard(index, { name: event.target.value })} placeholder="Pommel Strike" required /></label>
          <label>Acquired floor<input type="number" min="1" value={card.floor ?? ''} onChange={(event) => updateCard(index, { floor: event.target.value ? Number(event.target.value) : undefined })} placeholder="Optional" /></label>
          <label className="upgrade-toggle"><input type="checkbox" checked={card.upgraded ?? false} onChange={(event) => updateCard(index, { upgraded: event.target.checked || undefined })} /> Upgraded</label>
          <button className="delete card-remove" type="button" onClick={() => setCards(cards.filter((_, cardIndex) => cardIndex !== index))}>Remove</button>
          <ChoicePicker label="Effects / enchantments" options={CARD_EFFECT_GROUPS} value={card.effects ?? []} onChange={(effects) => updateCard(index, { effects })} grouped />
        </div>)}</div>
        <button className="secondary" type="button" onClick={() => setCards([...cards, { name: '' }])}>+ Add card</button>
      </fieldset>
      <label className="wide">Relics<textarea value={relics} onChange={(e) => setRelics(e.target.value)} placeholder="One per line" rows={3} /></label>
      <ChoicePicker label="Potions" options={POTIONS} value={potions} onChange={setPotions} wide />
      <label className="wide">Notes<textarea name="notes" placeholder="What changed the run?" rows={3} /></label>
      <button className="primary" type="submit">Save run</button>
    </form>
  </section>
}
