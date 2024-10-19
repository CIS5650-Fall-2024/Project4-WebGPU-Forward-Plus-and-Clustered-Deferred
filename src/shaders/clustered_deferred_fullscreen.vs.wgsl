// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput {
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
    let corners = array<vec2f, 6>(
        vec2f(-1.f, -1.f),
        vec2f(1.f, -1.f),
        vec2f(-1.f, 1.f),
        vec2f(-1.f, 1.f),
        vec2f(1.f, -1.f),
        vec2f(1.f, 1.f)
    );

    var output: VertexOutput;
    output.fragPos = vec4f(corners[index], 0.f, 1.f);
    output.uv = corners[index] * vec2f(0.5, -0.5) + vec2f(0.5);
    return output;
}
