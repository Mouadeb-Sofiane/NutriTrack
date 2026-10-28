/** Saisie manuelle : calories rapides ou valeurs détaillées (pour la portion ou pour 100 g). */
import { useEffect, useState } from 'react';
import type { LineItem, Nutrients, Precision } from '../../domain/types';
import { checkPer100, fmtKcal, kcalFromMacros, manualLine, scalePer100 } from '../../domain/nutrition';
import { newId } from '../../data/ids';
import { repo } from '../../state/app';
import { Sheet } from '../../ui/Sheet';
import { Button, Field, Notice, NumberInput, Segmented, TextInput, Toggle } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';

type Mode = 'portion' | 'per100';

export function ManualSheet({ open, onClose, onAdd, quick }: { open: boolean; onClose: () => void; onAdd: (item: LineItem) => void; quick?: boolean }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('portion');
  const [qty, setQty] = useState<number | null>(null);
  const [n, setN] = useState<Nutrients>({ kcal: null, protein: null, carbs: null, fat: null });
  const [precision, setPrecision] = useState<Precision>('approx');
  const [saveFood, setSaveFood] = useState(false);
  const [detailed, setDetailed] = useState(!quick);

  useEffect(() => {
    if (open) {
      setName(''); setMode('portion'); setQty(null); setN({ kcal: null, protein: null, carbs: null, fat: null });
      setPrecision(quick ? 'rough' : 'approx'); setSaveFood(false); setDetailed(!quick);
    }
  }, [open, quick]);

  const setK = (k: keyof Nutrients) => (v: number | null) => setN((x) => ({ ...x, [k]: v }));
  const portionValues: Nutrients | null = mode === 'per100' ? (qty ? scalePer100(n, qty) : null) : n;
  const check = mode === 'per100' ? checkPer100(n, 'g') : { ok: true, errors: [], warnings: [] };
  const macroK = kcalFromMacros(n);
  const canAdd = !!portionValues && portionValues.kcal != null && check.ok && (mode === 'portion' || (qty ?? 0) > 0);

  const add = async () => {
    if (!portionValues) return;
    const label = name.trim() || (quick ? 'Calories rapides' : 'Aliment');
    const item = manualLine(newId('li'), label, portionValues, {
      quantity: mode === 'per100' ? qty : null,
      unit: mode === 'per100' ? 'g' : 'none',
      precision,
      source: { kind: 'manual', label: quick ? 'Calories saisies' : 'Valeurs saisies' },
    });
    if (mode === 'per100' && qty) item.baseAmount = qty;
    if (saveFood && mode === 'per100') {
      const food = await repo.saveFood({ id: newId('food'), name: label, basis: 'g', per100: n, servings: [], source: { kind: 'manual', label: 'Saisi par moi' }, favorite: true });
      item.foodId = food.id;
      toast('Aliment enregistré dans tes favoris');
    }
    onAdd(item);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={quick ? 'Calories rapides' : 'Saisie manuelle'} footer={<Button block disabled={!canAdd} onClick={add}>Ajouter {portionValues?.kcal != null ? `· ${fmtKcal(portionValues.kcal)} kcal` : ''}</Button>}>
      <Field label="Nom">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={quick ? 'Ex. Goûter chez des amis' : 'Ex. Barre de céréales'} autoFocus />
      </Field>
      {!quick && (
        <Field label="Les valeurs que je connais sont…">
          <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: 'portion', label: 'Pour ma portion' }, { value: 'per100', label: 'Pour 100 g' }]} />
        </Field>
      )}
      {mode === 'per100' && (
        <Field label="Quantité mangée" error={qty != null && qty <= 0 ? 'La quantité doit être positive.' : null}>
          <NumberInput value={qty} onChange={setQty} suffix="g" />
        </Field>
      )}
      <Field label={mode === 'per100' ? 'Calories pour 100 g' : 'Calories'} hint={macroK != null && n.kcal == null ? `D’après les macros : ~${fmtKcal(macroK)} kcal` : undefined}>
        <NumberInput value={n.kcal} onChange={setK('kcal')} suffix="kcal" inputMode="numeric" />
      </Field>
      {macroK != null && n.kcal == null && <Button variant="ghost" size="sm" className="-mt-2 mb-2" onClick={() => setK('kcal')(Math.round(macroK))}>Utiliser {fmtKcal(macroK)} kcal</Button>}
      {quick && !detailed ? (
        <Button variant="ghost" size="sm" onClick={() => setDetailed(true)}>+ Ajouter protéines, glucides, lipides</Button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Protéines"><NumberInput value={n.protein} onChange={setK('protein')} suffix="g" /></Field>
          <Field label="Glucides"><NumberInput value={n.carbs} onChange={setK('carbs')} suffix="g" /></Field>
          <Field label="Lipides"><NumberInput value={n.fat} onChange={setK('fat')} suffix="g" /></Field>
        </div>
      )}
      <p className="mb-3 text-[12.5px] text-muted">Laisse vide ce que tu ne connais pas : la valeur sera indiquée comme manquante, pas comme zéro.</p>
      <Field label="Ces valeurs sont…">
        <Segmented<Precision> value={precision} onChange={setPrecision} options={[{ value: 'exact', label: 'Précises' }, { value: 'approx', label: 'Approximatives' }, { value: 'rough', label: 'Une estimation' }]} />
      </Field>
      {check.errors.map((e) => <Notice key={e} tone="warn" className="mb-2">{e}</Notice>)}
      {check.warnings.map((e) => <Notice key={e} className="mb-2">{e}</Notice>)}
      {mode === 'per100' && <Toggle checked={saveFood} onChange={setSaveFood} label="Enregistrer dans mes aliments" desc="Pour le retrouver plus vite la prochaine fois." />}
    </Sheet>
  );
}
