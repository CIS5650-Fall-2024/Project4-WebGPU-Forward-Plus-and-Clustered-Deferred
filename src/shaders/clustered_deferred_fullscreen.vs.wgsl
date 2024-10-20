// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput
{
    let positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0), //bottom left
        vec2<f32>(3.0, -1.0), //bottom right
        vec2<f32>(-1.0, 3.0) //top left
    );

    let uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.0), //bottom left
        vec2<f32>(2.0, 0.0), //bottom right
        vec2<f32>(0.0, 2.0) //top left
    );

    let position : vec4<f32> = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    let uv : vec2<f32> = uvs[vertexIndex];

    return VertexOutput(position, uv);
}