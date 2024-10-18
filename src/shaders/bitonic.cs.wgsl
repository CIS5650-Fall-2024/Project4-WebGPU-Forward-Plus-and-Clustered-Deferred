@id(1) override j : u32;
@id(2) override k : u32;

@group(0) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(0) @binding(1) var<uniform> time: f32;

@compute @workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
  let idx1 = globalIdx.x;
  if (idx1 >= lightSet.numLights) {
    return;
  }
  let idx2 = idx1 ^ j;

  let light1 = lightSet.lights[idx1];
  let light2 = lightSet.lights[idx2];

  if (idx2 > idx1) {
    if (((idx1 & k) == 0u && light1.pos.z < light2.pos.z) || ((idx1 & k) != 0u && light1.pos.z > light2.pos.z)){
        lightSet.lights[idx1] = light2;
        lightSet.lights[idx2] = light1;
    }
  }
}