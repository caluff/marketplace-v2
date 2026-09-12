"use client";

import type { StoreSearchProductsResponse } from "@marketplace-v2/api/search-contracts";
import { ChevronDown, LoaderCircle, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import {
  clearSearchFilters,
  parseSearchParameters,
  SEARCH_SORT_OPTIONS,
  searchHref,
  type SearchParameters,
} from "../parameters";
import { getPriceSliderBounds, getPriceSliderValue } from "../price-range";

type FilterProps = {
  parameters: SearchParameters;
  facets: StoreSearchProductsResponse["facets"];
  priceRange: StoreSearchProductsResponse["price_range"];
};

const PRICE_FORMATTER = new Intl.NumberFormat("es-UY", {
  maximumFractionDigits: 2,
});

function PriceRangeFields({
  id,
  parameters,
  priceRange,
}: Pick<FilterProps, "parameters" | "priceRange"> & { id: string }) {
  const [minimumPrice, setMinimumPrice] = useState(
    parameters.minPrice?.toString() ?? "",
  );
  const [maximumPrice, setMaximumPrice] = useState(
    parameters.maxPrice?.toString() ?? "",
  );
  const bounds = getPriceSliderBounds(
    priceRange,
    parameters.minPrice,
    parameters.maxPrice,
  );
  const sliderValue = bounds
    ? getPriceSliderValue(minimumPrice, maximumPrice, bounds)
    : null;

  function updateFromSlider(values: number[]) {
    if (values.length < 2 || !bounds) return;
    setMinimumPrice(
      values[0] <= bounds.min ? "" : Number(values[0].toFixed(2)).toString(),
    );
    setMaximumPrice(
      values[1] >= bounds.max ? "" : Number(values[1].toFixed(2)).toString(),
    );
  }

  return (
    <>
      {bounds && sliderValue ? (
        <div className="clear-both mb-4 space-y-2">
          <output
            className="block text-center text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {PRICE_FORMATTER.format(sliderValue[0])} –{" "}
            {PRICE_FORMATTER.format(sliderValue[1])} USD
          </output>
          <Slider
            value={sliderValue}
            min={bounds.min}
            max={bounds.max}
            step={0.01}
            minStepsBetweenThumbs={0}
            onValueChange={updateFromSlider}
            thumbLabels={["Precio mínimo", "Precio máximo"]}
            className="min-h-11 lg:min-h-8"
          />
        </div>
      ) : null}
      <div className="clear-both grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label
            htmlFor={`${id}-min`}
            className="text-xs text-muted-foreground lg:text-[0.68rem]"
          >
            Desde
          </label>
          <Input
            id={`${id}-min`}
            name="min_price"
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            inputMode="decimal"
            placeholder="Mínimo"
            value={minimumPrice}
            onChange={(event) => setMinimumPrice(event.target.value)}
            className="h-11 px-3 text-sm lg:h-9"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`${id}-max`}
            className="text-xs text-muted-foreground lg:text-[0.68rem]"
          >
            Hasta
          </label>
          <Input
            id={`${id}-max`}
            name="max_price"
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            inputMode="decimal"
            placeholder="Máximo"
            value={maximumPrice}
            onChange={(event) => setMaximumPrice(event.target.value)}
            className="h-11 px-3 text-sm lg:h-9"
          />
        </div>
      </div>
    </>
  );
}

function FacetFields({
  title,
  name,
  values,
  selected,
}: {
  title: string;
  name: string;
  values: StoreSearchProductsResponse["facets"]["categories"];
  selected: string[];
}) {
  const options = [
    ...values,
    ...selected
      .filter((id) => !values.some((value) => value.id === id))
      .map((id) => ({ id, label: id, count: 0 })),
  ];
  if (!options.length) return null;
  return (
    <details open className="group border-b border-border py-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold lg:min-h-8 lg:text-xs [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <fieldset className="mt-1 max-h-52 space-y-0.5 overflow-y-auto">
        <legend className="sr-only">{title}</legend>
        {options.map((value) => (
          <label
            key={value.id}
            className="flex min-h-11 cursor-pointer items-center gap-2 text-sm lg:min-h-8 lg:text-xs"
          >
            <input
              type="checkbox"
              name={name}
              value={value.id}
              defaultChecked={selected.includes(value.id)}
              className="size-4 shrink-0 accent-brand-accent lg:size-3.5"
            />
            <span className="min-w-0 flex-1 break-words">{value.label}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {value.count}
            </span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}

function FilterForm({
  parameters,
  facets,
  priceRange,
  onApply,
}: FilterProps & { onApply?: () => void }) {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resetCount, setResetCount] = useState(0);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = parseSearchParameters({
      q: parameters.q,
      category_id: form.getAll("category_id").map(String),
      seller_id: form.getAll("seller_id").map(String),
      min_price: String(form.get("min_price") ?? ""),
      max_price: String(form.get("max_price") ?? ""),
      sort: parameters.sort,
    });
    startTransition(() => {
      router.push(searchHref(next), { scroll: false });
      onApply?.();
    });
  }
  return (
    <form key={resetCount} onSubmit={submit} aria-busy={isPending}>
      <fieldset className="border-b border-border py-3">
        <legend className="float-left mb-3 w-full text-sm font-semibold lg:text-xs">
          Precio (USD)
        </legend>
        <PriceRangeFields
          id={id}
          parameters={parameters}
          priceRange={priceRange}
        />
      </fieldset>
      <FacetFields
        title="Categorías"
        name="category_id"
        values={facets.categories}
        selected={parameters.categoryIds}
      />
      <FacetFields
        title="Tiendas"
        name="seller_id"
        values={facets.sellers}
        selected={parameters.sellerIds}
      />
      <Button
        type="submit"
        size="sm"
        className="mt-4 h-11 w-full lg:h-9"
        disabled={isPending}
      >
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Aplicar filtros
      </Button>
      <Button asChild variant="ghost" size="sm" className="mt-1 w-full">
        <Link
          href={searchHref(clearSearchFilters(parameters))}
          scroll={false}
          onClick={() => {
            setResetCount((count) => count + 1);
            onApply?.();
          }}
        >
          Limpiar filtros
        </Link>
      </Button>
    </form>
  );
}

export function SearchFilters(props: FilterProps) {
  return (
    <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:border lg:border-border lg:bg-muted/15 lg:p-3">
      <div className="flex min-h-8 items-center gap-2 border-b border-border pb-2">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Filtros</h2>
      </div>
      <FilterForm key={searchHref(props.parameters)} {...props} />
    </aside>
  );
}

export function MobileSearchFilters(props: FilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="lg:hidden">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtros
        </Button>
      </DialogTrigger>
      <DialogContent
        className="top-0 left-0 h-dvh max-h-dvh w-[min(24rem,100vw)] max-w-none translate-x-0 translate-y-0 content-start gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        aria-describedby={undefined}
      >
        <DialogTitle>Filtrar productos</DialogTitle>
        <FilterForm
          key={searchHref(props.parameters)}
          {...props}
          onApply={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SearchSortSelect({
  parameters,
}: Pick<FilterProps, "parameters">) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      {isPending ? (
        <LoaderCircle
          className="size-4 animate-spin"
          aria-label="Ordenando productos"
        />
      ) : null}
      <NativeSelect
        aria-label="Ordenar productos"
        value={parameters.sort}
        disabled={isPending}
        onChange={(event) => {
          const sort =
            SEARCH_SORT_OPTIONS.find(
              (option) => option.value === event.target.value,
            )?.value ?? "relevance";
          startTransition(() =>
            router.push(searchHref({ ...parameters, sort, page: 1 }), {
              scroll: false,
            }),
          );
        }}
      >
        {SEARCH_SORT_OPTIONS.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

export function ActiveSearchFilters({
  parameters,
  facets,
}: Pick<FilterProps, "parameters" | "facets">) {
  const chips = [
    ...parameters.categoryIds.map((id) => ({
      key: `category-${id}`,
      label: facets.categories.find((facet) => facet.id === id)?.label ?? id,
      href: searchHref({
        ...parameters,
        categoryIds: parameters.categoryIds.filter((value) => value !== id),
        page: 1,
      }),
    })),
    ...parameters.sellerIds.map((id) => ({
      key: `seller-${id}`,
      label: facets.sellers.find((facet) => facet.id === id)?.label ?? id,
      href: searchHref({
        ...parameters,
        sellerIds: parameters.sellerIds.filter((value) => value !== id),
        page: 1,
      }),
    })),
    ...(parameters.minPrice !== undefined || parameters.maxPrice !== undefined
      ? [
          {
            key: "price",
            label: `${parameters.minPrice ?? 0} – ${parameters.maxPrice ?? "Sin máximo"} USD`,
            href: searchHref({
              ...parameters,
              minPrice: undefined,
              maxPrice: undefined,
              page: 1,
            }),
          },
        ]
      : []),
  ];
  if (!chips.length) return null;
  return (
    <nav aria-label="Filtros activos" className="mb-6 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          scroll={false}
          className="inline-flex min-h-11 items-center gap-2 border border-border bg-muted/40 px-3 text-xs transition-colors hover:border-foreground"
          aria-label={`Quitar filtro: ${chip.label}`}
        >
          {chip.label}
          <X className="size-3.5" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
