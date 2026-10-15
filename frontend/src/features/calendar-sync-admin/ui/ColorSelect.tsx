import { Button as AriaButton, Dialog, DialogTrigger, Popover, Radio, RadioGroup } from "react-aria-components";
import { useT } from "@/shared/lib/i18n";
import { cx } from "@/utils/cx";
import { CALENDAR_COLORS, colorOf } from "../model/colors";

/** 同期予定の色を選ぶ（このアカウントの予定は、どのアカウントに書いてもこの色になる） */
export function ColorSelect({ value, onChange, isDisabled }: { value: string; onChange: (id: string) => void; isDisabled?: boolean }) {
  const current = colorOf(value);
  const t = useT();
  const name = current ? t(current.name) : undefined;
  const groupLabel = t({ ja: "同期予定の色", en: "Color of synced events" });
  return (
    <DialogTrigger>
      <AriaButton
        isDisabled={isDisabled}
        aria-label={`${groupLabel}: ${name ?? t({ ja: "未設定", en: "Not set" })}`}
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-button-default px-2.5 text-caption-1-medium text-text-secondary outline-none transition-colors hover:border-border-button-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:opacity-50"
      >
        <span aria-hidden="true" className="size-3.5 rounded-full" style={{ backgroundColor: current?.hex ?? "transparent" }} />
        {name ?? t({ ja: "色", en: "Color" })}
      </AriaButton>
      <Popover placement="bottom end" offset={6} className="rounded-xl border border-border-button-default bg-background-primary-default p-3 shadow-lg">
        <Dialog aria-label={groupLabel} className="outline-none">
          {({ close }) => (
            <RadioGroup
              aria-label={groupLabel}
              value={value}
              onChange={(id) => {
                onChange(id);
                close();
              }}
              className="grid grid-cols-6 gap-2"
            >
              {CALENDAR_COLORS.map((c) => (
                <Radio
                  key={c.id}
                  value={c.id}
                  aria-label={t(c.name)}
                  className={({ isSelected, isFocusVisible }) =>
                    cx(
                      "size-7 cursor-pointer rounded-full outline-none transition-transform hover:scale-110 active:scale-95",
                      isSelected && "ring-2 ring-text-primary ring-offset-2 ring-offset-background-primary-default",
                      isFocusVisible && "ring-2 ring-border-focus-ring ring-offset-2 ring-offset-background-primary-default",
                    )
                  }
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </RadioGroup>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
