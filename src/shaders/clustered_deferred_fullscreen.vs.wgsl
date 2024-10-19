// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
// CHECKITOUT: you can use this vertex shader for all of the renderers
struct VertexOutput
{
    @builtin(position) fragPos: vec4f
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput
{
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),  
        vec2<f32>(-1.0, 3.0),   
        vec2<f32>(3.0, -1.0)     
    );

    var out: VertexOutput;
    out.fragPos = vec4<f32>(positions[vertexIndex], 0.0, 1.0);

    return out;
}
