import { Sliders } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocalPrefs } from "@/lib/localPrefs";

export function OptionsSettingsSection() {
  const [prefs, setPrefs] = useLocalPrefs();

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider font-data">
          Options Settings
        </h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Commission per contract ($)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={prefs.optionsCommissionPerContract}
              onChange={(e) =>
                setPrefs({
                  optionsCommissionPerContract: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="0DTE hard exit (ET)">
            <Input
              type="time"
              value={prefs.zeroDteHardExitEt}
              onChange={(e) => setPrefs({ zeroDteHardExitEt: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Profit target (% of max profit)"
            hint="50% is the standard credit-trade target."
          >
            <Input
              type="number"
              step="1"
              min="0"
              max="100"
              value={prefs.optionsProfitTargetPct}
              onChange={(e) =>
                setPrefs({ optionsProfitTargetPct: Number(e.target.value) || 0 })
              }
            />
          </Field>
          <Field
            label="Stop loss (% of credit/debit)"
            hint="200% of credit, 100% of debit are common defaults."
          >
            <Input
              type="number"
              step="1"
              min="0"
              value={prefs.optionsStopLossPct}
              onChange={(e) =>
                setPrefs({ optionsStopLossPct: Number(e.target.value) || 0 })
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="IV Rank source">
            <Select
              value={prefs.ivrSource}
              onValueChange={(v) =>
                setPrefs({ ivrSource: v as typeof prefs.ivrSource })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="broker">Broker (default)</SelectItem>
                <SelectItem value="tos">tastytrade</SelectItem>
                <SelectItem value="thinkorswim">thinkorswim</SelectItem>
                <SelectItem value="manual">Manual entry</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Earnings play mode">
            <Select
              value={prefs.earningsPlayMode}
              onValueChange={(v) =>
                setPrefs({ earningsPlayMode: v as typeof prefs.earningsPlayMode })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warn">Always warn</SelectItem>
                <SelectItem value="ask">Ask each time</SelectItem>
                <SelectItem value="ignore">Ignore</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Saved locally on this device. These values feed defaults in the Options
          Trade form, 0DTE module, and earnings detection.
        </p>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-data uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}