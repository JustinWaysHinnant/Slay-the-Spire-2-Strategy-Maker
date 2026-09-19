import { useState, type FormEvent } from 'react'
import { CHARACTERS, type Outcome, type Pickup, type Run } from '../lib/types'

interface Props { onAdd: (run: Run) => void }
const parseCards = (text: string): Pickup[] => text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
  const match = line.match(/^(.*?)\s*@\s*(\d+)$/)
  return match ? { name: match[1].trim(), floor: Number(match[2]) } : { name: line }
})
const parseNames = (text: string): Pickup[] => text.split(/\n|,/).map((name) => name.trim()).filter(Boolean).map((name) => ({ name }))

export function RunForm({ onAdd }: Props) {
  const [cards, setCards] = useState('')
  const [relics, setRelics] = useState('')
  const [outcome, setOutcome] = useState<Outcome>('loss')
  const today = new Date().toISOString().slice(0, 10)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onAdd({
      id: crypto.randomUUID(), date: String(data.get('date')), character: String(data.get('character')) as Run['character'],
      ascension: Number(data.get('ascension')), outcome, floor: Number(data.get('floor')), killedBy: String(data.get('killedBy') ?? '').trim() || undefined,
      cards: parseCards(cards), relics: parseNames(relics), notes: String(data.get('notes') ?? '').trim() || undefined,
    })
    event.currentTarget.reset(); setCards(''); setRelics(''); setOutcome('loss')
  }
  return <section className="panel form-panel">
    <div className="section-heading"><div><p className="eyebrow">New record</p><h2>Log a run</h2></div><p className="hint">For cards, use <code>Card name @ floor</code> to unlock timing insights.</p></div>
    <form onSubmit={submit} className="run-form">
      <label>Date<input name="date" type="date" defaultValue={today} required /></label>
      <label>Character<select name="character">{CHARACTERS.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Ascension<input name="ascension" type="number" min="0" max="20" defaultValue="0" required /></label>
      <label>Outcome<select name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>{(['win', 'loss', 'abandoned'] as const).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Final floor<input name="floor" type="number" min="0" defaultValue="1" required /></label>
      <label>Defeated by<input name="killedBy" disabled={outcome !== 'loss'} placeholder="Enemy or boss" /></label>
      <label className="wide">Cards<textarea value={cards} onChange={(e) => setCards(e.target.value)} placeholder={'Pommel Strike @ 4\nInflame @ 12'} rows={5} /></label>
      <label className="wide">Relics<textarea value={relics} onChange={(e) => setRelics(e.target.value)} placeholder="One per line" rows={3} /></label>
      <label className="wide">Notes<textarea name="notes" placeholder="What changed the run?" rows={3} /></label>
      <button className="primary" type="submit">Save run</button>
    </form>
  </section>
}
