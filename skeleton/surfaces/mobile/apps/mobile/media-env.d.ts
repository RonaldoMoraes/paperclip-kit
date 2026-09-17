/** Metro turns an imported media file into an asset handle; TypeScript needs telling. */
declare module "*.png" {
  const asset: number;
  export default asset;
}
declare module "*.jpg" {
  const asset: number;
  export default asset;
}
declare module "*.mp4" {
  const asset: number;
  export default asset;
}
