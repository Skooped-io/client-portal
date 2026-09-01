// heic-decode ships no types. Surface: decode({ buffer }) → first image as
// RGBA; decode.all({ buffer }) → lazy decoders for every image in the file.
declare module 'heic-decode' {
  interface DecodedImage {
    width: number
    height: number
    data: Uint8ClampedArray
  }
  interface DecodeInput {
    buffer: Uint8Array | ArrayBuffer | Buffer
  }
  function decode(input: DecodeInput): Promise<DecodedImage>
  namespace decode {
    function all(input: DecodeInput): Promise<Array<{ decode: () => Promise<DecodedImage> }>>
  }
  export = decode
}
