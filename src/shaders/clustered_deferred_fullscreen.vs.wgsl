// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput 
{
    // create a triangle that covers the entire canvas
    var positions = array<vec2f, 3>(
        vec2f(-1.0, -1.0),  // Bottom-left
        vec2f(3.0, -1.0),   // Bottom-right (overshoot for full coverage)
        vec2f(-1.0, 3.0)    // Top-left (overshoot for full coverage)
    );

    var uvs = array<vec2f, 3>(
        vec2f(0.0, 0.0),  // Bottom-left
        vec2f(2.0, 0.0),  // Bottom-right
        vec2f(0.0, 2.0)   // Top-left
    );
    
    return VertexOutput(vec4f(positions[vertexIndex], 0.0, 1.0), uvs[vertexIndex]);
}