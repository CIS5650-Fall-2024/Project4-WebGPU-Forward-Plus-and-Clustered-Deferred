// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
struct VertexOutput {
    @builtin(position) fragPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
    var out: VertexOutput;

    var pos = array<vec2<f32>, 4>(
        vec2(-1.0, -1.0),
        vec2(1.0, -1.0),
        vec2(-1.0, 1.0),
        vec2(1.0, 1.0)
    );

    var uv = array<vec2<f32>, 4>(
        vec2(0.0, 0.0),
        vec2(1.0, 0.0),
        vec2(0.0, 1.0),
        vec2(1.0, 1.0)
    );

    out.fragPos = vec4<f32>(pos[index], 1.0, 1.0);
    out.uv = uv[index];

    return out;
}