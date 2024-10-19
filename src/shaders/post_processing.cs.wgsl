// File: shaders/post_processing.cs.wgsl

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let x = global_id.x;
    let y = global_id.y;

    // Sample surrounding pixels for blur
    var color = vec4f(0.0);
    let offsets = array<vec2i, 9>(
        vec2i(-1, -1), vec2i(0, -1), vec2i(1, -1),
        vec2i(-1,  0), vec2i(0,  0), vec2i(1,  0),
        vec2i(-1,  1), vec2i(0,  1), vec2i(1,  1)
    );

    for (var i = 0u; i < 9u; i = i + 1u) {
        let offset = offsets[i];
        let uv = vec2i(i32(x) + offset.x, i32(y) + offset.y);
        color = color + textureLoad(inputTex, uv, 0);
    }

    color = color / 9.0;

    textureStore(outputTex, vec2u(x, y), color);
}
