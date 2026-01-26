/**
 * Photo Data Model
 * 
 * Represents a photo entity in the system.
 * Photos store image blobs separately from plant metadata.
 * Photos are stored with string keys (not numeric IDs) for compatibility
 * with the existing system.
 */

export interface Photo {
  key: string // String key used to store/retrieve the photo
  blob: Blob // The actual image data
  // Note: Photos are referenced by key in the plant's photos array
  // We don't store plantId in photos - the relationship is maintained
  // through the plant's photos array
}
