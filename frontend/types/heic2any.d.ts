declare module "heic2any" {
  type Heic2AnyArgs = {
    blob: Blob;
    toType?: string;
    quality?: number;
  };

  export default function heic2any(args: Heic2AnyArgs): Promise<Blob | Blob[]>;
}


