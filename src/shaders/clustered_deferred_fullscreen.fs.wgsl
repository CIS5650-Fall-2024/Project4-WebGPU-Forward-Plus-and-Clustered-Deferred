// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camUnif: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var gBufferPosition: texture_2d<f32>;
@group(1) @binding(1) var gBufferAlbedo: texture_2d<f32>;
@group(1) @binding(2) var gBufferNormal: texture_2d<f32>;

@fragment
fn main(@builtin(position) coord : vec4f) -> @location(0) vec4f {
    let position = textureLoad(gBufferPosition, vec2<i32>(coord.xy), 0).rgb;
    let normal = textureLoad(gBufferNormal, vec2<i32>(coord.xy), 0).rgb;
    let albedo = textureLoad(gBufferAlbedo, vec2<i32>(coord.xy), 0).rgb;

    let tileSize = camUnif.resolution / vec2f(${numClustersX}, ${numClustersY});

    // Get the fragment position in view space
    let posView = (camUnif.viewMat * vec4f(position, 1.0)).xyz;

    // Figure out depth tile using logarithmic depth (reverse of what we did in the compute shader)
    let zTile = u32((log(abs(posView.z) / camUnif.nearFarPlane[0]) * f32(${numClustersZ})) / log(camUnif.nearFarPlane[1] / camUnif.nearFarPlane[0]));

    // Get the tile index
    let tile = vec3<u32>(vec2<u32>(coord.xy / tileSize), zTile);
    let tileIndex = tile.x 
                    + (tile.y * ${numClustersX}) 
                    + (tile.z * ${numClustersX} * ${numClustersY});

    let cluster = &clusterSet.clusters[tileIndex];  

    // Do lighting calculations
    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, position.xyz, normal.rgb);
    }

    var finalColor = totalLightContrib * albedo;
    return vec4(finalColor, 1);
}