// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    
    // Define vertices for a fullscreen triangle
    let vertices = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f(3.0, -1.0),
        vec2f(-1.0, 3.0)
    );

    // Get the vertex position from the array
    let pos = vertices[vertexIndex];

    // Set the position
    out.position = vec4f(pos, 0.0, 1.0);

    // Calculate UV coordinates
    out.uv = pos * 0.5 + 0.5;

    return out;
}
