declare module "shapefile" {
  interface Source<T> {
    read(): Promise<{ done: boolean; value: T }>;
  }

  function open(
    shp: ArrayBuffer | string,
    dbf?: ArrayBuffer | string,
    options?: Record<string, unknown>
  ): Promise<Source<GeoJSON.Feature>>;

  export { open };
}
