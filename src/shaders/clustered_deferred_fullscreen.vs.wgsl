// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32> 
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0), 
        vec2<f32>(-1.0,  3.0)
    );

    var uvCoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.0), 
        vec2<f32>(2.0, 0.0),
        vec2<f32>(0.0, 2.0)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0); 
    output.uv = uvCoords[vertexIndex]; 
    return output;
}

