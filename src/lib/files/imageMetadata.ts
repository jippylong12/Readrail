const STRIPPABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type MetadataStripResult = {
  file: File
  stripped: boolean
  warning: string | null
}

export async function stripImageMetadata(file: File): Promise<MetadataStripResult> {
  if (!STRIPPABLE_IMAGE_TYPES.has(file.type)) {
    return { file, stripped: false, warning: null }
  }

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return {
      file,
      stripped: false,
      warning: `Could not strip metadata from ${file.name}; this browser does not support image re-encoding.`,
    }
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas rendering is unavailable.')
    }

    context.drawImage(bitmap, 0, 0)
    const strippedBlob = await canvasToBlob(canvas, file.type)
    return {
      file: new File([strippedBlob], file.name, {
        lastModified: Date.now(),
        type: strippedBlob.type || file.type,
      }),
      stripped: true,
      warning: null,
    }
  } catch (error) {
    return {
      file,
      stripped: false,
      warning: `Could not strip metadata from ${file.name}; sending the original file. ${formatMetadataError(error)}`,
    }
  } finally {
    bitmap?.close()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('Image re-encoding failed.'))
      },
      type,
      type === 'image/jpeg' || type === 'image/webp' ? 0.95 : undefined,
    )
  })
}

function formatMetadataError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}
