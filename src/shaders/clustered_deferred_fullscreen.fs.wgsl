@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

// G-Buffer
@group(1) @binding(0) var bufferPos: texture_2d<f32>;
@group(1) @binding(1) var bufferNor: texture_2d<f32>;
@group(1) @binding(2) var bufferCol: texture_2d<f32>;


@fragment
fn main(@builtin(position) coord : vec4f) -> @location(0) vec4f {
    let posWorld = textureLoad(bufferPos, vec2i(floor(coord.xy)), 0).rgb;
    let normal = textureLoad(bufferNor, vec2i(floor(coord.xy)), 0).rgb;
    let albedo = textureLoad(bufferCol, vec2i(floor(coord.xy)), 0).rgb;

    let linearClusterSize : u32 = u32(numGrid.x * numGrid.y * numGrid.z); 

    var posView : vec3f = (cameraUniforms.viewMat * vec4f(posWorld, 1.f)).xyz;

    var fragCoord = coord; 

    // Locating which cluster this fragment is part of
    let zTile : u32 = u32((log(abs(posView.z) / zNear) * f32(numGrid.z)) / log(zFar / zNear));
    let tileSize : vec2f = cameraUniforms.canvasSize / vec2f(numGrid.xy);
    var tile : vec3<u32> = vec3<u32>(vec2<u32>(fragCoord.xy / tileSize), u32(zTile));
    let tileIndex : u32 = tile.x + (tile.y * numGrid.x) + (tile.z * numGrid.x * numGrid.y);

    let cluster : ptr<storage, Cluster, read> = &clusterSet.clusters[tileIndex];  

    var totalLightContrib = vec3f(0, 0, 0);

    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, posWorld, normal);
    }

    let finalColor = albedo * totalLightContrib;

    return vec4f(finalColor, 1.);
}