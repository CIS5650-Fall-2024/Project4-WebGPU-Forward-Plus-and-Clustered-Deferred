// struct scalarsStruct {
//     size: f32,
//     aScalar: f32
// };
// @group(0) @binding(0) var<uniform> scalars: scalarsStruct;

// @group(0) @binding(1) var<storage> xVector: array<f32>;
// @group(0) @binding(2) var<storage> yVector: array<f32>;
// @group(0) @binding(3) var<storage, read_write> zVector: array<f32>;
// @group(0) @binding(4) var depthTexture: texture_depth_2d;

@compute @workgroup_size(32)
fn computeMain(@builtin(global_invocation_id) index: vec3u) {
    // let i = index.x;
    // let depth = textureLoad(depthTexture, vec2<i32>(i32(0), i32(0)), 0);
    // if (i < u32(scalars.size)) {
    //     zVector[i] = (scalars.aScalar * xVector[i]) + yVector[i];
    // }
}
