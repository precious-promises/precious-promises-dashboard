/**
 * The storage functions the render worker uses, re-exported from the
 * generated-media layer so the worker has one import surface and tests can
 * see exactly which storage operations rendering is allowed to perform:
 * store, check existence, record the asset row. Nothing here deletes.
 */
export {
  generatedMediaExists,
  recordGeneratedAsset,
  storeGeneratedMedia,
} from "@/lib/storage/generated";

export { generatedObjectKey } from "@/lib/storage/generated-config";
