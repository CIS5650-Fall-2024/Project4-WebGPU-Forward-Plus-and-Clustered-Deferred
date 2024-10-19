// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
struct VertexOutput {
    @builtin(position) fragPos: vec4<f32>,
    @location(0) pos: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusters: array<ClusterSet>;

@group(1) @binding(0) var gBufferTexture: texture_2d<u32>;

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    
    // Sample textures from G buffer
    let gBuffer = textureLoad(gBufferTexture, vec2i(input.fragPos.xy), 0);

    let diffuseColor = unpack4x8unorm(gBuffer.x);
    let normal = decodeNormalOctahedron(unpack2x16unorm(gBuffer.y));
    var depth = unpack2x16unorm(gBuffer.z).x;

    let pos4_world = camera.invViewProjMat * vec4<f32>(input.pos.x, input.pos.y, depth, 1.0);
    let pos_world = pos4_world.xyz / pos4_world.w;

    // Determine which cluster contains the current fragment.
    let clusterIndex = getClusterIndex(pos_world, camera);

    let cluster = clusters[clusterIndex];
    // Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let lightCount = cluster.lightCount;
    // Initialize a variable to accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);

    // For each light in the cluster:
    for (var i = 0u; i < lightCount; i++) {
        // Access the light's properties using its index.
        let lightIndex = cluster.lightIndices[i];
        let light = lightSet.lights[lightIndex];
        
        // Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
        let lightContrib = calculateLightContrib(light, pos_world, normal);
        // Add the calculated contribution to the total light accumulation.
        totalLightContrib += lightContrib;
    }

    // Multiply the fragment’s diffuse color by the accumulated light contribution.
    var finalColor = diffuseColor.rgb * totalLightContrib;

    // Return the final color, ensuring that the alpha component is set appropriately (typically to 1).
    return vec4<f32>(finalColor, 1.0);
}