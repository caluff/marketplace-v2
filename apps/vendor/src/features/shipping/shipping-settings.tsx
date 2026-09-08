import Link from "next/link";
import { MapPin, Package, Plus, Truck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { formatMoney } from "../workspace/presentation";
import { shippingConfiguration, shippingOptionState } from "./operations";
import { ShippingForm } from "./shipping-form";
import { shippingProfileName } from "./presentation";

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export async function ShippingSettings() {
  const { client } = await workspace();
  const result = await resultOf(shippingConfiguration(client));
  if (!result.data) return <DataError message={result.error} />;
  const { profiles, options, locations } = result.data;
  if (locations.count !== 1 || locations.stock_locations.length !== 1)
    return (
      <Card>
        <CardContent className="pt-6 text-sm">
          Necesitas el almacén único de tu tienda para configurar envíos.{" "}
          <Link href="/seller/inventory/locations" className="underline">
            Revisar almacén
          </Link>
        </CardContent>
      </Card>
    );
  const warehouse = locations.stock_locations[0];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="grid size-9 shrink-0 place-items-center bg-muted text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Origen y cobertura</CardTitle>
              <CardDescription className="mt-1">
                Todas las tarifas salen desde este almacén.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline">Estados Unidos · USD</Badge>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="font-semibold">{warehouse.name}</p>
          <p className="mt-1 text-muted-foreground">
            {[
              warehouse.address?.address_1,
              warehouse.address?.city,
              warehouse.address?.province,
              warehouse.address?.postal_code,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="shipping-profiles-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="shipping-profiles-title" className="text-lg font-bold">
              Perfiles de envío
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada perfil reúne las tarifas disponibles para un grupo de
              ofertas.
            </p>
          </div>
          <Badge variant="muted">
            {countLabel(profiles.length, "perfil", "perfiles")}
          </Badge>
        </div>

        {profiles.length ? (
          <Accordion
            type="multiple"
            defaultValue={[profiles[0].id]}
            className="space-y-3"
          >
            {profiles.map((profile) => {
              const profileOptions = options
                .filter((option) => option.shipping_profile_id === profile.id)
                .map((option) => ({
                  option,
                  state: shippingOptionState(option),
                }));
              const activeOptions = profileOptions.filter(
                ({ state }) => state.enabled,
              ).length;
              const profileName = shippingProfileName(profile);

              return (
                <AccordionItem
                  key={profile.id}
                  value={profile.id}
                  className="overflow-hidden rounded-xl border border-border/80 bg-card px-6 shadow-card"
                >
                  <AccordionTrigger className="py-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-9 shrink-0 place-items-center bg-muted text-muted-foreground">
                        <Package className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate font-bold">
                          {profileName}
                        </span>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {countLabel(
                            profileOptions.length,
                            "tarifa",
                            "tarifas",
                          )}
                          {profileOptions.length
                            ? ` · ${countLabel(activeOptions, "activa", "activas")}`
                            : " · Sin configurar"}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="space-y-6 border-t pt-5">
                    <section
                      className="bg-muted/35 p-4"
                      aria-label="Datos del perfil"
                    >
                      <ShippingForm
                        key={`${profile.id}-${profile.name}`}
                        profileId={profile.id}
                        name={profileName}
                      />
                    </section>

                    <section aria-labelledby={`${profile.id}-rates-title`}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3
                            id={`${profile.id}-rates-title`}
                            className="font-bold"
                          >
                            Tarifas
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Abre una tarifa para revisar o editar sus
                            condiciones.
                          </p>
                        </div>
                        <Badge variant="outline">
                          {countLabel(
                            profileOptions.length,
                            "tarifa",
                            "tarifas",
                          )}
                        </Badge>
                      </div>

                      <Accordion
                        type="single"
                        collapsible
                        className="overflow-hidden border"
                      >
                        {!profileOptions.length ? (
                          <div className="border-b px-4 py-5 text-sm text-muted-foreground">
                            Este perfil todavía no tiene tarifas. Añade una para
                            que el comprador pueda elegir un tipo de envío.
                          </div>
                        ) : null}
                        {profileOptions.map(({ option, state }) => {
                          const description = option.type?.description ?? "";
                          const price = state.editable
                            ? Number(state.amount) === 0
                              ? "Gratis"
                              : formatMoney(state.amount, "USD")
                            : "Configuración avanzada";

                          return (
                            <AccordionItem key={option.id} value={option.id}>
                              <AccordionTrigger className="px-4 py-4 hover:bg-muted/35">
                                <div className="grid min-w-0 flex-1 gap-3 pr-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                  <div className="min-w-0">
                                    <span className="block truncate font-semibold">
                                      {option.name}
                                    </span>
                                    <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                                      {description || "Sin plazo visible"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 sm:justify-end">
                                    <span className="text-sm font-semibold">
                                      {price}
                                    </span>
                                    <Badge
                                      variant={
                                        state.enabled ? "success" : "muted"
                                      }
                                    >
                                      {state.enabled ? "Activa" : "Inactiva"}
                                    </Badge>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="border-t bg-muted/20 px-4 pt-5">
                                {state.editable ? (
                                  <ShippingForm
                                    key={`${option.id}-${option.name}-${state.amount}-${state.enabled}-${description}`}
                                    isOption
                                    optionId={option.id}
                                    name={option.name}
                                    description={description}
                                    amount={state.amount}
                                    enabled={state.enabled}
                                  />
                                ) : (
                                  <p className="text-sm leading-6 text-muted-foreground">
                                    Esta tarifa usa una configuración avanzada y
                                    no se puede editar desde esta vista. Puedes
                                    crear una tarifa fija nueva para este
                                    perfil.
                                  </p>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}

                        <AccordionItem value={`${profile.id}-new-rate`}>
                          <AccordionTrigger className="px-4 py-4 text-primary hover:bg-muted/35">
                            <span className="flex items-center gap-2 font-semibold">
                              <Plus className="size-4" aria-hidden="true" />
                              Añadir tarifa
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="border-t bg-muted/20 px-4 pt-5">
                            <div className="mb-4 flex items-center gap-2">
                              <Truck
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <h4 className="font-bold">Nueva tarifa fija</h4>
                            </div>
                            <ShippingForm isOption profileId={profile.id} />
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </section>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <div className="border border-dashed p-6 text-sm text-muted-foreground">
            Crea un perfil para empezar a configurar tarifas.
          </div>
        )}

        <Accordion type="single" collapsible>
          <AccordionItem
            value="new-profile"
            className="overflow-hidden rounded-xl border border-dashed bg-card px-6"
          >
            <AccordionTrigger className="py-5 text-primary">
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center border border-current/20 bg-primary/5">
                  <Plus className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-bold">
                    {profiles.length
                      ? "Crear otro perfil"
                      : "Crear el primer perfil"}
                  </span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Agrupa ofertas que comparten las mismas tarifas.
                  </span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="border-t pt-5">
              <ShippingForm />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </div>
  );
}
