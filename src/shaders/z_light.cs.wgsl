@group(0) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(1) @binding(0) var<storage, read_write> zbins: ZArray;

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
    var zmax : f32 = ${zMax};
    var zmin : f32 = ${zMin};
    var zsize : f32 = ${zSize};
    var ls : f32 = ${lightRadius};

    let idx = globalIdx.x;
    if (idx >= ${zSize}) {
        return;
    }

    let step = (zmax -  zmin) / zsize;
    let lowerBound = zmin + step * f32(idx);
    let upperBound = lowerBound + step;

    let low : u32 = findLightLowerBound(lowerBound - ls);
    let high : u32 = findLightUpperBound(upperBound + ls);
    let num : u32 = (high << 16) + (low & 0xFFFF);
    zbins.arr[idx] = num;

}