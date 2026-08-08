import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export type SelectOption = { value: string; label: string };

/**
 * Thin wrapper over the shadcn (Base UI) Select that takes a flat list of
 * options and a string value, isolating the Base UI specifics in one place.
 */
export function AppSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  triggerClassName,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  id?: string;
}) {
  const items: Record<string, string> = {};
  for (const o of options) items[o.value] = o.label;

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v ?? "")}
      items={items}
    >
      <SelectTrigger id={id} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={className}>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
