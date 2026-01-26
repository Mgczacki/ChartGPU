# Incremental GPU Append Optimization Guide

## Overview

This document provides guidance for implementing an optional incremental GPU append optimization in `src/data/createDataStore.ts` for streaming scenarios. The optimization enables `appendSeries(index, newPoints)` to write only appended bytes when conditions are correct, avoiding full buffer re-uploads.

## Current Implementation Analysis

### Existing `appendSeries` Behavior

The current `appendSeries` implementation already supports incremental writes:

1. **Fast path (no reallocation)**: Writes only the appended byte range via `queue.writeBuffer(buffer, byteOffset, appendPacked.buffer)`
2. **Slow path (reallocation)**: When buffer growth is needed, re-uploads the entire series
3. **Hash maintenance**: Uses incremental FNV-1a hash updates over appended IEEE-754 bit patterns
4. **CPU-side tracking**: Maintains mutable `data` array for `getSeriesData()` correctness

### Current Usage Pattern

The render coordinator (`createRenderCoordinator.ts`) currently:
- Calls `setSeries(i, s.data)` during render, where `s.data` is the **sampled** data
- Applies sampling in `recomputeRuntimeBaseSeries()` and `recomputeRenderSeries()`
- Does not currently use `appendSeries` for streaming appends

## Constraints

### 1. 4-Byte Alignment (Critical)

**WebGPU Requirement**: `queue.writeBuffer()` offsets and sizes must be multiples of 4 bytes.

**Current Implementation**:
- `roundUpToMultipleOf4()` ensures alignment
- Point size: `2 floats × 4 bytes = 8 bytes` (already aligned)
- Byte offset calculation: `prevPointCount * 2 * 4` (always aligned)

**Verification**:
```typescript
// Line 250: byteOffset is always aligned
const byteOffset = prevPointCount * 2 * 4; // Multiple of 8, which is multiple of 4 ✓
```

**Recommendation**: No changes needed. The current implementation already enforces 4-byte alignment correctly.

### 2. Buffer Growth Strategy

**Current Policy**:
- Geometric growth: power-of-two capacity (`nextPow2()`)
- Minimum buffer size: 4 bytes (`MIN_BUFFER_BYTES`)
- No shrinking: capacity never decreases
- Growth trigger: `targetBytes > capacityBytes`

**Growth Formula**:
```typescript
const required = Math.max(MIN_BUFFER_BYTES, roundUpToMultipleOf4(requiredBytes));
const grown = Math.max(MIN_BUFFER_BYTES, nextPow2(required));
capacityBytes = Math.max(currentCapacityBytes, grown);
```

**Recommendation**: Keep existing growth policy. It balances memory efficiency (power-of-two) with allocation frequency (geometric growth reduces churn).

### 3. Correctness with Hash/Caching Logic

**Current Hash Behavior**:
- `setSeries`: Computes full hash via `hashFloat32ArrayBits(packed.f32)`
- `appendSeries`: Incremental hash update via `fnv1aUpdate(existing.hash32, appendWords)`
- Hash comparison: `existing.hash32 === hash32` for change detection

**Critical Invariant**: The incremental hash update must produce the same result as a full hash of the combined data.

**Verification**:
```typescript
// Incremental update (line 256)
const nextHash32 = fnv1aUpdate(existing.hash32, appendWords);

// Should equal:
const fullPacked = packDataPoints(nextData);
const fullHash32 = hashFloat32ArrayBits(fullPacked.f32);
// nextHash32 === fullHash32 ✓ (FNV-1a is associative for concatenation)
```

**Recommendation**: Current hash logic is correct. FNV-1a is associative for concatenated data, so incremental updates match full hashes.

## When to Use Incremental Append

### Safe Conditions

Use `appendSeries` when **all** of the following are true:

1. **`sampling === 'none'`**: No downsampling applied
2. **Full-span rendering**: No zoom window, or zoom window covers full range (`start <= 0 && end >= 100`)
3. **Sequential append**: New points are appended to the end (not inserted/modified)
4. **Series already exists**: `setSeries()` was called previously

### Unsafe Conditions (Fallback to `setSeries`)

Use `setSeries` when **any** of the following are true:

1. **Sampling enabled**: `sampling !== 'none'` (data is downsampled, so GPU buffer doesn't match raw data)
2. **Zoom window active**: `zoomRange != null && (zoomRange.start > 0 || zoomRange.end < 100)` (only visible subset is rendered)
3. **Data modification**: Points were inserted, deleted, or modified (not just appended)
4. **Series not initialized**: First call for a series (must use `setSeries`)

## Integration Strategy

### Option 1: Render Coordinator Decision (Recommended)

Modify `createRenderCoordinator.ts` to conditionally use `appendSeries`:

```typescript
// In flushPendingAppendsIfNeeded() or render()
for (let i = 0; i < seriesForRender.length; i++) {
  const s = seriesForRender[i];
  if (s.type === 'pie') continue;
  
  const canUseIncrementalAppend =
    s.sampling === 'none' &&
    (zoomRange == null || (zoomRange.start <= 0 && zoomRange.end >= 100)) &&
    dataStore.getSeriesPointCount(i) > 0; // Series exists
  
  if (canUseIncrementalAppend && pendingAppendByIndex.has(i)) {
    const newPoints = pendingAppendByIndex.get(i);
    if (newPoints && newPoints.length > 0) {
      dataStore.appendSeries(i, newPoints);
      continue; // Skip setSeries for this series
    }
  }
  
  // Fallback: use setSeries (handles sampling, zoom, etc.)
  dataStore.setSeries(i, s.data);
}
```

**Pros**:
- Centralized decision logic
- Clear separation of concerns
- Easy to test and debug

**Cons**:
- Requires tracking pending appends separately
- More complex render path

### Option 2: DataStore Heuristic (Alternative)

Add a heuristic to `setSeries` to detect append-only patterns:

```typescript
const setSeries = (index: number, data: ReadonlyArray<DataPoint>): void => {
  const existing = series.get(index);
  
  // Heuristic: if new data starts with existing data, try incremental append
  if (existing && existing.pointCount > 0) {
    const existingData = existing.data;
    if (data.length >= existingData.length) {
      let isPrefixMatch = true;
      for (let i = 0; i < existingData.length; i++) {
        if (data[i] !== existingData[i]) {
          isPrefixMatch = false;
          break;
        }
      }
      
      if (isPrefixMatch) {
        // Append only the new points
        const newPoints = data.slice(existingData.length);
        if (newPoints.length > 0) {
          appendSeries(index, newPoints);
          return;
        }
      }
    }
  }
  
  // Fallback to full setSeries
  // ... existing implementation
};
```

**Pros**:
- Transparent to callers
- No changes needed in render coordinator

**Cons**:
- Less explicit control
- Requires point-by-point comparison (O(n) cost)
- May not work correctly with sampling/zoom

**Recommendation**: Prefer Option 1 (render coordinator decision) for explicit control and correctness.

## Edge Cases and Safety

### 1. Buffer Reallocation During Append

**Scenario**: Append causes buffer growth, triggering slow path.

**Current Handling**: ✅ Correct
- Destroys old buffer
- Creates new buffer with geometric growth
- Re-uploads full series
- Updates hash correctly

**No changes needed**.

### 2. Empty Append

**Scenario**: `appendSeries(index, [])` called.

**Current Handling**: ✅ Correct
- Early return at line 189
- No GPU write
- No hash update
- No state change

**No changes needed**.

### 3. Hash Mismatch After Append

**Scenario**: Incremental hash doesn't match full hash (should never happen with FNV-1a).

**Current Handling**: ⚠️ No validation

**Recommendation**: Add debug-only validation in development:

```typescript
// In appendSeries, after incremental hash update:
if (process.env.NODE_ENV === 'development') {
  const fullPacked = packDataPoints(nextData);
  const fullHash = hashFloat32ArrayBits(fullPacked.f32);
  if (nextHash32 !== fullHash) {
    console.warn(`DataStore.appendSeries(${index}): hash mismatch (incremental: ${nextHash32}, full: ${fullHash})`);
  }
}
```

### 4. Concurrent Appends

**Scenario**: Multiple `appendSeries` calls before render.

**Current Handling**: ✅ Handled by render coordinator
- `pendingAppendByIndex` coalesces appends
- Single flush per render frame
- Sequential processing

**No changes needed**.

### 5. Sampling Change During Streaming

**Scenario**: User changes `sampling` from `'none'` to `'lttb'` during streaming.

**Handling**: ✅ Fallback to `setSeries`
- `canUseIncrementalAppend` becomes `false`
- Full re-upload with sampled data
- Hash recomputed from sampled data

**No changes needed**.

### 6. Zoom Window Change During Streaming

**Scenario**: User zooms in/out during streaming.

**Handling**: ✅ Fallback to `setSeries`
- `canUseIncrementalAppend` becomes `false` when zoom active
- Full re-upload with visible-range sampled data
- Hash recomputed from sampled subset

**No changes needed**.

## Performance Considerations

### Expected Benefits

1. **Reduced GPU bandwidth**: Only appended bytes transferred (e.g., 1KB append vs 10MB full upload)
2. **Lower CPU overhead**: No full data packing/hashing for unchanged points
3. **Faster render**: Fewer GPU commands, less queue submission overhead

### Measurement Points

Profile these metrics:
- `queue.writeBuffer()` call count and byte sizes
- CPU time in `packDataPoints()` and `hashFloat32ArrayBits()`
- GPU frame time (via `requestDevice()` timestamp queries)

### When Optimization Doesn't Help

1. **Frequent reallocations**: If appends frequently trigger buffer growth, slow path dominates
2. **Small appends**: Overhead of decision logic may exceed benefit for tiny appends (< 10 points)
3. **Sampling always enabled**: Optimization never triggers

## Implementation Checklist

- [ ] Add `canUseIncrementalAppend` check in render coordinator
- [ ] Track pending appends separately from full series updates
- [ ] Call `appendSeries` conditionally in render path
- [ ] Fallback to `setSeries` for all unsafe conditions
- [ ] Add debug hash validation (development only)
- [ ] Test with `sampling: 'none'` and full-span
- [ ] Test with `sampling: 'lttb'` (should fallback)
- [ ] Test with zoom window active (should fallback)
- [ ] Test buffer growth path (slow path)
- [ ] Test empty append
- [ ] Performance profile before/after

## Summary

The current `appendSeries` implementation is **already correct** for incremental GPU writes. The optimization is primarily about **when to use it**:

1. ✅ **4-byte alignment**: Already enforced correctly
2. ✅ **Buffer growth**: Geometric policy is appropriate
3. ✅ **Hash correctness**: FNV-1a incremental updates are correct
4. ⚠️ **Integration**: Need render coordinator changes to conditionally use `appendSeries`

**Key constraint**: Only use `appendSeries` when `sampling === 'none'` and full-span (no zoom), otherwise fallback to `setSeries` for correctness.
