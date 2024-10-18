@group(0) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(1) @binding(0) var<storage, read_write> zbins: ZBinArray;

fn findLightLowerBound(lowerBound: f32) -> u32 {

    var low = 0u;
    var high = lightSet.numLights;
    var mid = 0u;

    while (low < high) {
        mid = (low + high) / 2u;
        if (lowerBound <= -lightSet.lights[mid].pos.z) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    return low;
}

fn findLightUpperBound(upperBound: f32) -> u32 {

    var low = 0u;
    var high = lightSet.numLights;
    var mid = 0u;

    while (low < high) {
        mid = (low + high) / 2u;
        if (upperBound >= -lightSet.lights[mid].pos.z) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    return low;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
  let idx = globalIdx.x;
  if (idx >= ${zBinSize}) {
    return;
  }
  
  let step = (${zMax} -  ${zMin}) / ${zBinSize};
  let lowerBound = ${zMin} + step * f32(idx);
  let upperBound = lowerBound + step;

  let low : u32 = findLightLowerBound(lowerBound - ${lightRadius});
  let high : u32 = findLightUpperBound(upperBound + ${lightRadius});
  let num : u32 = (high << 16) + (low & 0xFFFF);
  zbins.bins[idx] = num;

}