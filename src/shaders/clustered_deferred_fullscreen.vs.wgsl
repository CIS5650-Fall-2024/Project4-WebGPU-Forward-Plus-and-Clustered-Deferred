
// declare the intermediate data
struct IntermediateData {
    
    // declare the fragment position
    @builtin(position) point: vec4f,
    
    // declare the fragment texture coordinate
    @location(0) coordinate: vec2f
};

// declare the vertex shader
@vertex fn main(@builtin(vertex_index) index: u32) -> IntermediateData {
    
    // create a constant array of positions
    let positions = array<vec2f, 6>(
        vec2f(-1.0f, 1.0f),
        vec2f(-1.0f, -1.0f),
        vec2f(1.0f, -1.0f),
        vec2f(1.0f, -1.0f),
        vec2f(1.0f, 1.0f),
        vec2f(-1.0f, 1.0f),
    );
    
    // declare the intermediate data
    var data: IntermediateData;
    
    // write the position
    data.point = vec4f(
        positions[index].x,
        positions[index].y,
        0.0f, 1.0f
    );
    
    // write the texture coordinate
    data.coordinate = positions[index] * 0.5f + 0.5f;
    
    // invert the y coordinate
    data.coordinate.y = 1.0f - data.coordinate.y;
    
    // return the intermediate data
    return data;
}
