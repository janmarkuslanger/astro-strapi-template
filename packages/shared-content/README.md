# shared-content

Fixtures in **Strapi response format**. Sole purpose: seeding an empty CMS
exactly once (`apps/cms/src/seed.ts`).

After the first seed the CMS is the source of truth and these files drift —
that is intended. They describe how a site *starts*, not how it looks today.
There is no sync back. See CLAUDE.md §2.

Re-seed locally by deleting the database:

```bash
rm -rf apps/cms/.tmp && npm run dev:cms
```
