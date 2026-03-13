'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWaveSquare, faFloppyDisk, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import type { RegimeConfig, ServerConfig } from '@/lib/use-trading-engine-v2';

interface Props {
  regimeConfig: RegimeConfig;
  config: ServerConfig;
  walletBalance: number;
  effectiveMaxPositions: number;
  onSaveRegime: (updates: Partial<RegimeConfig>) => Promise<void>;
  onSaveConfig: (updates: Partial<ServerConfig>) => Promise<void>;
}

type PresetKey = 'A' | 'B' | 'C';

const PRESETS: Record<PresetKey, { label: string; regime: Partial<RegimeConfig>; core: Partial<ServerConfig> }> = {
  A: {
    label: 'Aanbevolen (A)',
    regime: {
      filterMode: 'signal-first',
      signalFirstDirectionalBlock: true,
      signalFirstDirectionalBlockMode: 'soft',
      neutralConfidenceUplift: 10,
      neutralThrottleFactor: 0.30,
      neutralSensitivity: 0.58,
      signalFirstDisableCooldown: false,
      signalFirstDisableLossStreak: false,
      signalFirstDisableLatch: false,
    },
    core: {
      maxHoldMinutes: 12,
      cooldownAfterLossMinutes: 2,
      latchCandles: 3,
      reentryCooldownLossMinutes: 5,
      lossStreakLimit: 3,
      lossStreakPauseMinutes: 18,
    },
  },
  B: {
    label: 'Conservatief (B)',
    regime: { filterMode: 'strict', signalFirstDirectionalBlock: true, signalFirstDirectionalBlockMode: 'hard', neutralConfidenceUplift: 14, neutralThrottleFactor: 0.6, neutralSensitivity: 0.45 },
    core: { maxHoldMinutes: 10, cooldownAfterLossMinutes: 3, latchCandles: 4, reentryCooldownLossMinutes: 6, lossStreakLimit: 2, lossStreakPauseMinutes: 24 },
  },
  C: {
    label: 'Agressief (C)',
    regime: { filterMode: 'signal-first', signalFirstDirectionalBlock: false, signalFirstDirectionalBlockMode: 'soft', neutralConfidenceUplift: 6, neutralThrottleFactor: 0.15, neutralSensitivity: 0.7 },
    core: { maxHoldMinutes: 14, cooldownAfterLossMinutes: 1, latchCandles: 2, reentryCooldownLossMinutes: 4, lossStreakLimit: 4, lossStreakPauseMinutes: 12 },
  },
};

export function V2RegimePanel({ regimeConfig, config, walletBalance, effectiveMaxPositions, onSaveRegime, onSaveConfig }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [preset, setPreset] = useState<PresetKey>('A');
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [regimeDraft, setRegimeDraft] = useState<RegimeConfig>(regimeConfig);
  const [configDraft, setConfigDraft] = useState<ServerConfig>(config);

  useEffect(() => setRegimeDraft(regimeConfig), [regimeConfig]);
  useEffect(() => setConfigDraft(config), [config]);

  const walletSlots = Math.max(1, Math.floor((walletBalance || 0) / Math.max(1, configDraft.positionSize || 1)));
  const hardMaxSlots = Math.min(20, walletSlots);
  const recommendedSlots = Math.max(1, Math.min(hardMaxSlots, Math.round(hardMaxSlots * 0.6)));

  const dirty = JSON.stringify(regimeDraft) !== JSON.stringify(regimeConfig) || JSON.stringify(configDraft) !== JSON.stringify(config);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    setRegimeDraft((p) => ({ ...p, ...PRESETS[key].regime }));
    setConfigDraft((p) => ({ ...p, ...PRESETS[key].core }));
  };

  const save = async () => {
    setIsSaving(true);
    setMsg(null);
    try {
      const boundedSlots = Math.max(1, Math.min(hardMaxSlots, Math.round(configDraft.maxPositions || 1)));
      await onSaveRegime(regimeDraft);
      await onSaveConfig({ ...configDraft, maxPositions: boundedSlots });
      setMsg('Opgeslagen');
    } catch {
      setMsg('Opslaan mislukt');
    } finally {
      setIsSaving(false);
    }
  };

  const summary = useMemo(() => `Profiel ${preset} • ${regimeDraft.filterMode} • slots ${configDraft.maxPositions}/${effectiveMaxPositions}`, [preset, regimeDraft.filterMode, configDraft.maxPositions, effectiveMaxPositions]);

  return (
    <Card className="hover:-translate-y-0 border-cyan-500/[0.1]">
      <CardHeader className="pb-2">
        <button onClick={() => setIsOpen((v) => !v)} className="w-full text-left">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-cyan-500/[0.1]"><FontAwesomeIcon icon={faWaveSquare} className="h-3.5 w-3.5 text-cyan-400" /></span>
            <CardTitle className="text-base">Regime • Core Risk • Execution Slots</CardTitle>
            <Badge variant="outline" className="text-[10px] border-cyan-500/25 text-cyan-300">{summary}</Badge>
            <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="h-3 w-3 text-white/50 ml-auto" />
          </div>
        </button>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
              <button key={key} onClick={() => applyPreset(key)} className={cn('px-2.5 py-1 rounded text-xs border', preset === key ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300' : 'border-white/10 text-white/60')}>
                {PRESETS[key].label}
              </button>
            ))}
          </div>

          <section className="rounded-md border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <p className="text-xs font-medium text-white/80">Regime</p>
            <p className="text-[11px] text-white/45">Kies hoe streng entries gefilterd worden op marktrichting en neutrale markt.</p>
            <div className="grid md:grid-cols-3 gap-3">
              <label className="text-xs">Entry mode
                <select value={regimeDraft.filterMode} onChange={(e) => setRegimeDraft((p) => ({ ...p, filterMode: e.target.value as RegimeConfig['filterMode'] }))} className="mt-1 w-full rounded bg-white/[0.03] border border-white/10 px-2 py-1">
                  <option value="signal-first">signal-first</option><option value="strict">strict</option>
                </select>
              </label>
              <label className="text-xs">Directional block
                <select value={regimeDraft.signalFirstDirectionalBlockMode || 'soft'} onChange={(e) => setRegimeDraft((p) => ({ ...p, signalFirstDirectionalBlockMode: e.target.value as 'soft' | 'hard', signalFirstDirectionalBlock: true }))} className="mt-1 w-full rounded bg-white/[0.03] border border-white/10 px-2 py-1">
                  <option value="soft">soft (best matching)</option><option value="hard">hard</option>
                </select>
              </label>
              <label className="text-xs">Neutral confidence uplift
                <input type="number" step={1} min={0} max={25} value={regimeDraft.neutralConfidenceUplift || 0} onChange={(e) => setRegimeDraft((p) => ({ ...p, neutralConfidenceUplift: Number(e.target.value) }))} className="mt-1 w-full rounded bg-white/[0.03] border border-white/10 px-2 py-1" />
              </label>
            </div>
          </section>

          <section className="rounded-md border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <p className="text-xs font-medium text-white/80">Core Risk</p>
            <p className="text-[11px] text-white/45">Deze waarden sturen entry-remmen en herinstap direct in de backend-flow.</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Max hold (min)" value={configDraft.maxHoldMinutes || 12} onChange={(v) => setConfigDraft((p) => ({ ...p, maxHoldMinutes: v }))} min={2} max={20} />
              <Field label="Cooldown na verlies (min)" value={configDraft.cooldownAfterLossMinutes || 2} onChange={(v) => setConfigDraft((p) => ({ ...p, cooldownAfterLossMinutes: v }))} min={0} max={20} />
              <Field label="Latch zelfde symbool (candles)" value={configDraft.latchCandles || 3} onChange={(v) => setConfigDraft((p) => ({ ...p, latchCandles: v }))} min={1} max={10} />
              <Field label="Re-entry na verlies (min)" value={configDraft.reentryCooldownLossMinutes || 5} onChange={(v) => setConfigDraft((p) => ({ ...p, reentryCooldownLossMinutes: v }))} min={0} max={30} />
              <Field label="Loss streak limiet" value={configDraft.lossStreakLimit || 3} onChange={(v) => setConfigDraft((p) => ({ ...p, lossStreakLimit: v }))} min={1} max={10} />
              <Field label="Pause bij streak (min)" value={configDraft.lossStreakPauseMinutes || 18} onChange={(v) => setConfigDraft((p) => ({ ...p, lossStreakPauseMinutes: v }))} min={1} max={60} />
            </div>
          </section>

          <section className="rounded-md border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <p className="text-xs font-medium text-white/80">Execution Slots</p>
            <p className="text-[11px] text-white/45">Slots zijn gekoppeld aan wallet / position size. Te hoge waarden worden automatisch begrensd.</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="text-xs text-white/70">Wallet: <span className="font-mono text-white/90">${walletBalance.toFixed(2)}</span></div>
              <div className="text-xs text-white/70">Aanbevolen slots: <span className="font-mono text-cyan-300">{recommendedSlots}</span></div>
              <div className="text-xs text-white/70">Max slots nu: <span className="font-mono text-amber-300">{hardMaxSlots}</span></div>
            </div>
            <Field label="Aantal slots" value={configDraft.maxPositions || 1} onChange={(v) => setConfigDraft((p) => ({ ...p, maxPositions: v }))} min={1} max={hardMaxSlots} />
          </section>

          <div className="flex items-center justify-end gap-3">
            <button onClick={save} disabled={isSaving || !dirty} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 disabled:opacity-40">
              <FontAwesomeIcon icon={faFloppyDisk} className="h-3 w-3" />{isSaving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
          {msg && <p className={cn('text-[11px]', msg.includes('mislukt') ? 'text-red-400' : 'text-emerald-400')}>{msg}</p>}
        </CardContent>
      )}
    </Card>
  );
}

function Field({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <label className="text-xs">
      {label}
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} className="mt-1 w-full rounded bg-white/[0.03] border border-white/10 px-2 py-1" />
    </label>
  );
}
