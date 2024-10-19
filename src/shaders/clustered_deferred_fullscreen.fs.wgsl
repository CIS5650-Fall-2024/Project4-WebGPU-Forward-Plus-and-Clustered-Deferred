// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
struct VertexOutput {
    @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusters: array<ClusterSet>;

@group(1) @binding(0) var gBufferPositionTexture: texture_2d<f32>;
@group(1) @binding(1) var gBufferAlbedoTexture: texture_2d<f32>;
@group(1) @binding(2) var gBufferNormalTexture: texture_2d<f32>;
@group(1) @binding(3) var texSampler: sampler;

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);

    // Sample textures from G buffer
    let depth = textureSample (gBufferPositionTexture, texSampler, uv).z;
    let diffuseColor = textureSample(gBufferAlbedoTexture, texSampler, uv);
    let normal = textureSample(gBufferNormalTexture, texSampler, uv).xyz;

    let pos4_world = camera.invViewProjMat * vec4<f32>(input.uv.x * 2.0 - 1.0, input.uv.y * 2.0 - 1.0, depth, 1.0);
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