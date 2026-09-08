# Phase 1 catalog media backend

The backend now uploads seller-owned public catalog images through the native
Medusa File workflow and a constrained native S3 provider. Supabase Storage is
the selected durable backend; credentials, bucket configuration, module
registration, migrations, and live verification remain coordinator-owned.
No database, Redis, or Supabase writes were executed by this dispatch.

## HTTP and integration contract

`POST /vendor/catalog-images` accepts a plain JSON body through the existing
typed SDK generic client and returns HTTP 201 with native `FileDTO[]`:

```ts
// Existing SDK instance, authentication/session headers, and x-seller-id.
body: {
  files: [{ filename: "photo.png", mime_type: "image/png", content: canonicalBase64 }]
}
// Response: { files: [{ id: nativeFileKey, url: nativePublicUrl }] }
```

Accepted formats are PNG, JPEG and WebP. Each file and the total decoded request
are limited to 5 MiB, with at most six files. The route-local JSON body parser
limit is 7 MiB to accommodate base64 expansion; there is no global parser change.
The coordinator's one-file-per-server-action client contract fits these limits.
SVG, arbitrary URLs, client access levels, malformed/noncanonical base64, MIME
mismatches, oversized content, malformed framing and unsupported signatures fail
before storage. Uploaded names are generated on the server with the correct
extension. These checks inspect signatures/container structure; they are not a
full raster decode or malware scan.

The workflow validates the current authentication identity binding, active
member, live seller membership, open/approved seller state through the existing
gate, and live RBAC `file/create` permission. It rechecks these permissions after
upload and before publishing ownership. No Supabase authentication or frontend
Storage client is introduced.

`lib/catalog-media/access.ts` exports:

```ts
assertSellerCatalogImages(container, sellerId, body): Promise<void>
```

For an existing product, callers must construct
`{ ...validatedBody, product_id: trustedRouteProductId }`. For creation, override
`product_id` with `undefined`; never pass a client-selected product ID as context.
For a native variant mutation also supply `variant_context: true` and the trusted
`variant_id` (or undefined for a new variant). Other modes must override
`variant_context: false` and `variant_id: undefined` so clients cannot change the
comparison context. The helper also validates nested `variants[].thumbnail`
URLs during product creation in the same ownership read.
The helper reads actual product images, thumbnail, visibility/restrictions and
seller proposal ownership, then checks durable seller/file ownership for new or
removed URLs. A known shared product image may remain unchanged. Removing or
replacing another seller's image/thumbnail, using an arbitrary URL with the same
bucket prefix, and supplying a foreign product-image ID are rejected. Adding more
than six gallery images is rejected; pre-existing larger shared galleries may
be preserved or reduced. Unrelated product edits do not read image ownership.

The catalog worker/coordinator owns integrating this helper in all relevant
native product and variant image validation paths and removing the temporary
blanket image prohibition. Product moderation remains native. No endpoint for
deleting stored files was added, and attaching/removing product references never
deletes storage objects.

Native `/vendor/uploads` does not stamp seller ownership. At the coordinator's
explicit request, the catalog-images middleware registration now denies that
legacy vendor endpoint with a deterministic message directing clients to
`/vendor/catalog-images`. Provider-level validation also applies to every upload
reaching the configured image-only provider.

## Native persistence and recovery

Medusa 2.18 `FileDTO` contains only `id` and `url`. The File module delegates to
the provider and does not persist file rows or metadata, so a small `catalogMedia`
module owns `catalog_image` records with seller ID, member ID, native file ID and
URL. It does not replace the File module or copy a backend File entity model.

The workflow uses `uploadFilesWorkflow.runAsStep`, then persists ownership through
its module service. A lost ownership commit response is recovered by reading
back the exact file IDs, seller, member and URLs. When ownership or the second
permission check fails, native workflow compensation deletes only files newly
returned by that upload. Pre-existing or shared files are never compensation
inputs. A storage failure returns no fabricated success or ownership record.

Native upload batches use `Promise.all` and the S3 provider assigns keys during
upload. A partial provider failure or lost S3 response can leave an unowned
object without a returned key; the native workflow cannot compensate an unknown
key. This patch deliberately does not add an independent upload/retry engine or
guess which objects to delete. Retry the request; inspect unowned objects before
any separate operator cleanup. The recommended one-file client requests reduce
the batch partial-failure surface. Native S3 deletion also logs and suppresses
provider deletion failures; live cleanup success was not claimed.

## Provider and module registration

The coordinator approved and installed `@medusajs/file-s3@2.18.0` as a direct API
dependency. `ProductMediaFileService` subclasses its published typed
`dist/services/s3-file` entrypoint because the provider default export contains
registration metadata and has no named public service class export.

The subclass preserves native S3 object writes/public URLs while forcing
`acl: false` and `additional_client_config.forcePathStyle: true`. It accepts only
explicit `access: "public"` validated images. Private or omitted access, streaming
uploads, and all presigned upload requests fail before a storage call. This is
necessary because public Supabase buckets expose object downloads independently
of a client's requested per-file ACL, and S3 ACL headers are unsupported.
See [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
and [public buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Required registrations:

1. Register `{ resolve: "./src/modules/catalog-media", options: { storage_enabled:
   Boolean(getProductImageStorageConfiguration()) } }` in the API module list.
2. When storage configuration exists, use File provider
   `{ resolve: "./src/modules/product-media-file", id: "product-media", options:
   getProductImageStorageConfiguration() }`. Do not register native S3 alongside
   this provider; native File permits exactly one provider.
3. Spread `vendorCatalogImageMiddlewares` from
   `api/vendor/catalog-images/middlewares.ts` into the root middleware routes.
   Preserve the existing global vendor membership gate.
4. Integrate `assertSellerCatalogImages` as described above and use the existing
   SDK to call the upload route from the frontend.

The module readiness option defaults to false. Missing storage configuration
therefore rejects the catalog route before native upload and cannot silently
persist these images through the development local File provider. The
coordinator's existing storage configuration helper owns the S3 endpoint, region,
access-key secrets, bucket, `products/` prefix, and public URL. No credential
values were inspected or printed. Supabase access keys should come from its S3
configuration, as documented in [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).

## Pending migration generation

No migration or generated snapshot was created or executed by this dispatch.
After registering the module, the coordinator must generate its schema migration
and snapshot on disposable infrastructure:

```sh
pnpm --filter @marketplace-v2/api exec medusa db:generate catalogMedia
```

The schema must include `catalog_image` and its DML timestamps, a unique native
`file_id`, unique `url`, and seller/URL lookup index. Before application, append
the repository's existing RLS/revoke hardening for the new table: enable RLS;
revoke all from PUBLIC and any existing anon/authenticated roles. The Medusa
backend role owns the table; no client Data API policies or public table grants
are required for serving images through Storage. Supabase's current default
table-exposure changes do not replace explicit privilege controls.

Preserve ownership identity against accidental updates in the migration:

```sql
create unique index catalog_image_file_forever on catalog_image (file_id);
create unique index catalog_image_url_forever on catalog_image (url);
create function public.catalog_image_preserve_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.seller_id,new.member_id,new.file_id,new.url)
     is distinct from row(old.seller_id,old.member_id,old.file_id,old.url)
  then raise exception 'Catalog image ownership is immutable' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.catalog_image_preserve_owner() from public;
create trigger catalog_image_owner_immutable before update on catalog_image
for each row execute function public.catalog_image_preserve_owner();
```

These are normal module-owned identifiers, not metadata uniqueness assumptions.
Do not expose upload/attachment as operational until the migration is applied
and Storage credentials/public-bucket behavior have been verified.

## Validation and scope

Focused tests exercise native upload workflow execution with mocked File and
module persistence, image validation, seller isolation, shared-image retention,
permission revocation, missing configuration, failure compensation, response-loss
recovery, and the actual native S3 PutObject command through a stubbed client.
They make no database or network writes. Final focused run: all 4 suites passed,
40 tests total before the final nested-variant and legacy-route hardening (28
media tests and 12 warehouse regression tests). The changed validation suite
then passed all 17 tests through the direct local Jest binary, bringing covered
cases to 43 across these four suites:

```sh
pnpm --filter @marketplace-v2/api test:unit --runTestsByPath src/lib/catalog-media/__tests__/catalog-media.unit.spec.ts src/lib/catalog-media/__tests__/upload-catalog-images.unit.spec.ts src/lib/catalog-media/__tests__/product-media-file.unit.spec.ts src/workflows/__tests__/vendor-warehouse.unit.spec.ts
```

Targeted ESLint exits successfully with one warning for the explicitly approved
published S3 service import; no lint rules were disabled. API typecheck passed
after fixing media workflow and fixture annotations and the coordinator's
concurrent Stripe type-import correction. The final build and migration/live
Storage gates remain coordinator-owned.

At the coordinator's explicit follow-up request, this dispatch also fixed the
prior `backfill-vendor-warehouse.ts` Medusa lint errors by returning actual
`StepResponse` instances at every step return. Warehouse behavior was preserved
and its focused regression suite was included in the final checks.

The Supabase changelog index was fetched and its relevant current changes were
reviewed; no Storage S3 breaking change required a different implementation.
Installed Medusa 2.18 File DTO/service/upload workflow/S3 source and Mercur 2.3.3
native vendor upload and product-image validators were inspected. Context7 and
current Supabase S3 docs supplemented those installed contracts. No servers,
live migrations, credential reads, or commits occurred. No install command was
requested by this worker; a final `pnpm exec eslint` invocation automatically
attempted dependency relinking while root was modifying dependency patches and
failed on the concurrent payout-provider patch. The coordinator was informed,
and the final focused Jest and ESLint checks used direct package-local binaries
successfully to avoid further package-manager mutation.
