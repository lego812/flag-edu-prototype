// Three 1MiB photos plus multipart overhead stay below the hosting body limit.
export const PHOTO_BATCH_SIZE = 3;
export const PHOTO_MAX_BYTES = 1048576;
export const PHOTO_BATCH_MAX_BYTES = PHOTO_BATCH_SIZE * PHOTO_MAX_BYTES + 65536;
