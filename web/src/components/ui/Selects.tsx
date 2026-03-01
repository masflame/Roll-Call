// Shared select components: ActionSelect (single) and MultiSelect (multi + search)
import { Fragment, useMemo, useState } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { ChevronDown, CheckCircle } from "lucide-react";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

type OptionObj = { label: string; value: string };
type OptInput = Array<string | OptionObj>;

export function ActionSelect({ value, onChange, options, includeAll = true, allLabel = 'All' }: { value: string; onChange: (v: string) => void; options: OptInput; includeAll?: boolean; allLabel?: string }) {
  // normalize options to objects
  const optsObj: OptionObj[] = options
    .filter(Boolean as any)
    .map((o) => (typeof o === 'string' ? { label: o, value: o } : o));

  const hasAll = optsObj.some((o) => String(o.value) === 'all');
  const opts = hasAll ? optsObj : (includeAll ? [{ label: allLabel, value: 'all' }, ...optsObj] : optsObj);

  const selectedLabel = opts.find((o) => String(o.value) === String(value))?.label ?? (value === 'all' ? allLabel : String(value ?? ''));

  return (
    <div className="relative">
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
            <Listbox.Button className="w-full inline-flex items-center justify-between gap-2 rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm text-left shadow-subtle transition focus:border-brand-primary">
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </Listbox.Button>

          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-50 mt-1 max-h-60 w-56 overflow-auto rounded-xl bg-surface py-2 text-sm shadow-subtle ring-1 ring-black ring-opacity-5">
              {opts.map((opt) => (
                <Listbox.Option
                  key={opt.value}
                  value={opt.value}
                  className={({ active }) => cx('cursor-pointer select-none px-3 py-2', active && 'bg-gray-50')}
                >
                  {({ selected }) => (
                    <div className="flex items-center justify-between">
                      <span className={selected ? 'font-semibold text-text-primary' : 'text-text-muted'}>{opt.label}</span>
                      {selected ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : null}
                    </div>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

export function MultiSelect({ options, value, onChange, placeholder = 'Select...' }: { options: string[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return options;
    return options.filter(o => o.toLowerCase().includes(query.toLowerCase()));
  }, [options, query]);

  return (
    <div>
      <Listbox value={value} onChange={(v: any) => onChange(v)} multiple>
        <div className="relative">
          <Listbox.Button className="w-full text-left rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm shadow-subtle transition focus:border-brand-primary">
            <div className="flex items-center justify-between">
              <div className="truncate text-sm">
                {value.length ? `${value.length} selected` : placeholder}
              </div>
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </div>
          </Listbox.Button>

          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-surface py-2 text-sm shadow-subtle ring-1 ring-black ring-opacity-5">
              <div className="px-3 pb-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter..."
                  className="w-full rounded-xl border border-stroke-subtle px-3 py-2 text-sm bg-surface transition focus:border-brand-primary"
                />
              </div>

              {filtered.map((opt) => (
                <Listbox.Option key={opt} value={opt} className={({ active }) => cx('cursor-pointer select-none px-3 py-2 flex items-center justify-between', active && 'bg-gray-50')}>
                  {({ selected }) => (
                    <>
                      <span className={selected ? 'font-semibold text-text-primary' : 'text-text-muted'}>{opt}</span>
                      {selected ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

export default ActionSelect;
