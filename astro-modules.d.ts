// Plain tsc cannot read .astro files (`astro check` can, with real props).
// For the test type-check an .astro import is what `astro check` makes of it,
// minus the props type: a component factory that takes props.
declare module "*.astro" {
  const Component: import("astro/runtime/server/index.js").AstroComponentFactory &
    ((props: Record<string, unknown>) => unknown);
  export default Component;
}
