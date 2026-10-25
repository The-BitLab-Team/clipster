import type { ReactNode } from 'react';

/** Campos acessíveis reutilizados nas seções de configuração (SPEC §14). */

interface ToggleFieldProps {
  id: string;
  label: string;
  hint?: string | undefined;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleField({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange
}: ToggleFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div className="field field--row">
      <div className="field__text">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        {hint !== undefined && (
          <p id={hintId} className="field__hint">
            {hint}
          </p>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  hint?: string | undefined;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** `column`: rótulo em cima e lista na largura toda (opções com texto longo). */
  layout?: 'row' | 'column';
}

export function SelectField<T extends string>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
  layout = 'row'
}: SelectFieldProps<T>) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div className={layout === 'row' ? 'field field--row' : 'field field--column'}>
      <div className="field__text">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        {hint !== undefined && (
          <p id={hintId} className="field__hint">
            {hint}
          </p>
        )}
      </div>
      <select
        id={id}
        className="select"
        aria-describedby={hintId}
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => option.value === event.currentTarget.value);
          if (selected !== undefined) onChange(selected.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface RangeFieldProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

export function RangeField({
  id,
  label,
  min,
  max,
  step,
  value,
  format,
  onChange
}: RangeFieldProps) {
  return (
    <div className="field field--column">
      <div className="field__header">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        <output htmlFor={id} className="field__value">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}
