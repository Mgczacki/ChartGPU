/**
 * Shared renderer utilities.
 *
 * Minimal, library-friendly helpers for common WebGPU boilerplate:
 * - shader module creation
 * - render pipeline creation (ergonomic config + sensible defaults)
 * - uniform buffer creation + updates
 *
 * Notes:
 * - All helpers are pure functions; they create resources but do not mutate external state.
 * - First argument is always `device: GPUDevice`.
 */

export type ShaderStageModuleSource =
  | {
      /** Use an existing module. */
      readonly module: GPUShaderModule;
      readonly entryPoint?: string;
      readonly constants?: Record<string, GPUPipelineConstantValue>;
    }
  | {
      /** Provide WGSL code to compile. */
      readonly code: string;
      readonly label?: string;
      readonly entryPoint?: string;
      readonly constants?: Record<string, GPUPipelineConstantValue>;
    };

export type VertexStageConfig = ShaderStageModuleSource & {
  readonly buffers?: readonly GPUVertexBufferLayout[];
};

export type FragmentStageConfig = ShaderStageModuleSource & {
  /**
   * Provide full color target states directly (most flexible).
   * If omitted, `formats` must be provided.
   */
  readonly targets?: readonly GPUColorTargetState[];
  /**
   * Convenience: provide one or more target formats and optionally a shared blend/writeMask.
   * Ignored if `targets` is provided.
   */
  readonly formats?: GPUTextureFormat | readonly GPUTextureFormat[];
  readonly blend?: GPUBlendState;
  readonly writeMask?: GPUColorWriteFlags;
};

export type RenderPipelineConfig =
  | (RenderPipelineConfigBase & { readonly fragment: FragmentStageConfig })
  | (RenderPipelineConfigBase & { readonly fragment?: undefined });

export interface RenderPipelineConfigBase {
  readonly label?: string;

  /**
   * Defaults to `'auto'`.
   *
   * If you provide `bindGroupLayouts`, a pipeline layout will be created for you.
   * If both are provided, `layout` wins.
   */
  readonly layout?: GPUPipelineLayout | 'auto';
  readonly bindGroupLayouts?: readonly GPUBindGroupLayout[];

  readonly vertex: VertexStageConfig;

  readonly primitive?: GPUPrimitiveState;
  readonly depthStencil?: GPUDepthStencilState;
  readonly multisample?: GPUMultisampleState;
}

const DEFAULT_VERTEX_ENTRY = 'vsMain';
const DEFAULT_FRAGMENT_ENTRY = 'fsMain';

const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

const alignTo = (value: number, alignment: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`alignTo(value): value must be a finite non-negative number. Received: ${String(value)}`);
  }
  if (!isPowerOfTwo(alignment)) {
    throw new Error(`alignTo(alignment): alignment must be a positive power of two. Received: ${String(alignment)}`);
  }
  const v = Math.floor(value);
  return (v + alignment - 1) & ~(alignment - 1);
};

const getStageModule = (
  device: GPUDevice,
  stage: ShaderStageModuleSource
): { readonly module: GPUShaderModule; readonly entryPoint: string; readonly constants?: Record<string, GPUPipelineConstantValue> } => {
  if ('module' in stage) {
    return {
      module: stage.module,
      entryPoint: stage.entryPoint || '',
      constants: stage.constants,
    };
  }

  return {
    module: createShaderModule(device, stage.code, stage.label),
    entryPoint: stage.entryPoint || '',
    constants: stage.constants,
  };
};

/**
 * Creates a shader module from WGSL source.
 */
export function createShaderModule(device: GPUDevice, code: string, label?: string): GPUShaderModule {
  if (typeof code !== 'string' || code.length === 0) {
    throw new Error('createShaderModule(code): WGSL code must be a non-empty string.');
  }
  return device.createShaderModule({ code, label });
}

/**
 * Creates a render pipeline with reduced boilerplate and sensible defaults.
 *
 * Defaults:
 * - `layout: 'auto'`
 * - `vertex.entryPoint: 'vsMain'`
 * - `fragment.entryPoint: 'fsMain'` (if fragment present)
 * - `primitive.topology: 'triangle-list'`
 * - `multisample.count: 1`
 */
export function createRenderPipeline(device: GPUDevice, config: RenderPipelineConfig): GPURenderPipeline {
  const layout: GPUPipelineLayout | 'auto' =
    config.layout ??
    (config.bindGroupLayouts ? device.createPipelineLayout({ bindGroupLayouts: [...config.bindGroupLayouts] }) : 'auto');

  const vertexStage = getStageModule(device, config.vertex);
  const vertexEntryPoint = vertexStage.entryPoint || DEFAULT_VERTEX_ENTRY;

  let fragment: GPUFragmentState | undefined = undefined;
  if (config.fragment) {
    const fragmentStage = getStageModule(device, config.fragment);
    const fragmentEntryPoint = fragmentStage.entryPoint || DEFAULT_FRAGMENT_ENTRY;

    let targets: readonly GPUColorTargetState[] | undefined = config.fragment.targets;
    if (!targets) {
      const formats = config.fragment.formats;
      if (!formats) {
        throw new Error(
          "createRenderPipeline(fragment): provide either `fragment.targets` or `fragment.formats` when a fragment stage is present."
        );
      }
      const formatList = Array.isArray(formats) ? formats : [formats];
      targets = formatList.map((format) => ({
        format,
        blend: config.fragment!.blend,
        writeMask: config.fragment!.writeMask,
      }));
    }

    fragment = {
      module: fragmentStage.module,
      entryPoint: fragmentEntryPoint,
      targets: [...targets],
      constants: fragmentStage.constants,
    };
  }

  const primitive: GPUPrimitiveState = config.primitive ?? { topology: 'triangle-list' };
  const multisample: GPUMultisampleState = config.multisample ?? { count: 1 };

  return device.createRenderPipeline({
    label: config.label,
    layout,
    vertex: {
      module: vertexStage.module,
      entryPoint: vertexEntryPoint,
      buffers: config.vertex.buffers ? [...config.vertex.buffers] : [],
      constants: vertexStage.constants,
    },
    fragment,
    primitive,
    depthStencil: config.depthStencil,
    multisample,
  });
}

/**
 * Creates a uniform buffer suitable for `@group/@binding` uniform bindings.
 *
 * Notes:
 * - WebGPU's `queue.writeBuffer()` requires `byteLength` and offsets to be multiples of 4.
 * - Uniform data layout in WGSL is typically aligned to 16 bytes; we default to a 16-byte size alignment.
 * - If you plan to use this buffer with *dynamic offsets*, you must additionally align offsets to
 *   `device.limits.minUniformBufferOffsetAlignment` (commonly 256). This helper does not enforce that.
 */
export function createUniformBuffer(
  device: GPUDevice,
  size: number,
  options?: { readonly label?: string; readonly alignment?: number }
): GPUBuffer {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`createUniformBuffer(size): size must be a positive number. Received: ${String(size)}`);
  }

  const alignment = options?.alignment ?? 16;
  const alignedSize = alignTo(size, Math.max(4, alignment));

  const maxSize = device.limits.maxUniformBufferBindingSize;
  if (alignedSize > maxSize) {
    throw new Error(
      `createUniformBuffer(size): requested size ${alignedSize} exceeds device.limits.maxUniformBufferBindingSize (${maxSize}).`
    );
  }

  return device.createBuffer({
    label: options?.label,
    size: alignedSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

/**
 * Writes CPU data into a uniform buffer (default offset 0).
 *
 * `data` must be a `BufferSource`:
 * - `ArrayBuffer` or `ArrayBufferView` (TypedArray/DataView)
 *
 * Important WebGPU constraint:
 * - `queue.writeBuffer()` requires write size (and offsets) to be multiples of 4 bytes.
 */
export function writeUniformBuffer(device: GPUDevice, buffer: GPUBuffer, data: BufferSource): void {
  const src =
    data instanceof ArrayBuffer
      ? { arrayBuffer: data, offset: 0, size: data.byteLength }
      : { arrayBuffer: data.buffer, offset: data.byteOffset, size: data.byteLength };

  if (src.size === 0) return;

  if ((src.offset & 3) !== 0 || (src.size & 3) !== 0) {
    throw new Error(
      `writeUniformBuffer(data): data byteOffset (${src.offset}) and byteLength (${src.size}) must be multiples of 4 for queue.writeBuffer().`
    );
  }

  if (src.size > buffer.size) {
    throw new Error(`writeUniformBuffer(data): data byteLength (${src.size}) exceeds buffer.size (${buffer.size}).`);
  }

  device.queue.writeBuffer(buffer, 0, src.arrayBuffer, src.offset, src.size);
}
