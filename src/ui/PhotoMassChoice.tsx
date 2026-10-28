/** Choix « d'après la photo » : poids estimé de l'assiette et part attribuée à cet aliment. */
import { PLATE_SHARES, shareOf, type MassRange } from '../domain/photoMass';
import { Chip, Toggle } from './kit';

export interface PhotoMassState {
  on: boolean;
  share: number;
}

export function PhotoMassChoice({ mass, state, onChange }: { mass: MassRange; state: PhotoMassState; onChange: (s: PhotoMassState) => void }) {
  const r = shareOf(mass, state.share);
  return (
    <div className="mb-4 rounded-2xl bg-brand-soft/60 p-3">
      <Toggle checked={state.on} onChange={(on) => onChange({ ...state, on })} label={`D’après la photo : ~${r.normal} g`} desc={`Estimation haute ${r.high} g · fourchette ${r.low}–${r.high} g. Calculé sur la photo, pas pesé.`} />
      {state.on && (
        <>
          <div className="mb-1 text-[12.5px] font-semibold">Part de l’assiette pour cet aliment</div>
          <p className="mb-1.5 text-[12px] text-muted">Le poids estimé concerne toute l’assiette : s’il y a plusieurs aliments, indique la part de celui-ci.</p>
          <div className="flex flex-wrap gap-2">
            {PLATE_SHARES.map(([v, l]) => <Chip key={v} active={Math.abs(state.share - v) < 0.001} onClick={() => onChange({ ...state, share: v })}>{l}</Chip>)}
          </div>
        </>
      )}
    </div>
  );
}
