@id(1) override j : u32;
@id(2) override k : u32;

@group(${bindGroup_scene}) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> time: f32;

@compute @workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
  let idx = globalIdx.x;
  //if (idx >= lightSet.numLights) {
  //  return;
  //}
  let l = idx ^ j;

  let lightA = lightSet.lights[idx];
  var lightB = lightSet.lights[l];
  if (lightB.idx >= lightSet.numLights) {
    lightB.pos.z = -9999999.f;
  }

  if (l > idx) {
    if (((idx & k) == 0u && lightA.pos.z < lightB.pos.z) || ((idx & k) != 0u && lightA.pos.z > lightB.pos.z)){
        lightSet.lights[idx] = lightB;
        lightSet.lights[l] = lightA;
    }
  }

}