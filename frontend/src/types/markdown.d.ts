declare module "react-markdown" {
  import type { ComponentType } from "react";

  export type Components = Record<string, ComponentType<any>>;

  const ReactMarkdown: ComponentType<any>;
  export default ReactMarkdown;
}

declare module "remark-gfm" {
  import type { Plugin } from "unified";
  const plugin: Plugin;
  export default plugin;
}
