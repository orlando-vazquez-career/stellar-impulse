export {};

declare module "react" {
  interface SVGAttributes<T> {
    hidden?: boolean | undefined;
  }
}
