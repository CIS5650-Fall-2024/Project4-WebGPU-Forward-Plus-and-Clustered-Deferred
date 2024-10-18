struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),  
        vec2<f32>(-1.0, 3.0),   
        vec2<f32>(3.0, -1.0)     
    );

    var texCoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),  
        vec2<f32>(0.0, -1.0),   
        vec2<f32>(2.0, 1.0)     
    );

    var out: VertexOutput;
    out.fragPos = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    out.uv = texCoords[vertexIndex];

    return out;
}