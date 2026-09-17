// NativeWind's runtime rewrites className into native styles through the Metro/Babel
// pipeline, which vitest does not run. Under jsdom a className is just an attribute, so
// `cssInterop` has nothing to teach and hands the component straight back.
export const cssInterop = <C>(component: C): C => component;

export const remapProps = <C>(component: C): C => component;
