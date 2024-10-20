@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: array<ClusterSet>;

// textures
@group(${bindGroup_texture}) @binding(0) var posTex: texture_2d<f32>;
@group(${bindGroup_texture}) @binding(1) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_texture}) @binding(2) var normalTex: texture_2d<f32>;

// simple sobel edge detection
fn calculateEdge(index: vec2i, normal: vec3f) -> f32 {

    let neighbors = array<vec2i, 8>(
        vec2i(-1, -1), vec2i(0, -1), vec2i(1, -1),
        vec2i(-1, 0),               vec2i(1, 0),
        vec2i(-1, 1), vec2i(0, 1), vec2i(1, 1)
    );

    var edgeValue = 0.0;

    // compare normal to neighbors
    for (var i = 0; i < 8; i++) {
        let neighborNormal = textureLoad(normalTex, index + neighbors[i], 0).xyz;
        edgeValue += length(normal - neighborNormal);
    }

    // set edge thickness
    return step(1.0, edgeValue);
}

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {

    let index = vec2i(floor(fragPos.xy));

    let worldPos = textureLoad(posTex, index, 0).xyz;
    let diffuse = textureLoad(diffuseTex, index, 0);
    let normal = textureLoad(normalTex, index, 0).xyz;

    let clipPos = cameraUniforms.viewProj * vec4f(worldPos, 1.0);

    let xIdx = u32((clipPos.x / clipPos.w + 1.0) / 2.0 * ${clusterSize});
    let yIdx = u32((clipPos.y / clipPos.w + 1.0) / 2.0 * ${clusterSize});

    let viewPos = cameraUniforms.view * vec4f(worldPos, 1.0);
    let logDepth = log(cameraUniforms.far / cameraUniforms.near);
    let zIdx = u32(log(-viewPos.z / cameraUniforms.near) / logDepth * ${clusterSize});

    let clusterIdx = xIdx + yIdx * ${clusterSize} + zIdx * ${clusterSize} * ${clusterSize};

    //----------------------------------------------------------

    let clusterLights = clusterSet[clusterIdx].numLights;
    var totalLightContrib = vec3f(0, 0, 0);
    for (var l = 0u; l < clusterLights; l++) {
        let light = lightSet.lights[clusterSet[clusterIdx].lights[l]];
        let lightContrib = calculateLightContrib(light, worldPos, normal);
        totalLightContrib += lightContrib;
    }

    // toon shading processing ----------------------------------
    
    var quantizedLight = vec3f(
        step(0.6, totalLightContrib.r) * 0.6 + step(0.05, totalLightContrib.r) * 0.3,
        step(0.6, totalLightContrib.g) * 0.6 + step(0.05, totalLightContrib.g) * 0.3,
        step(0.6, totalLightContrib.b) * 0.6 + step(0.05, totalLightContrib.b) * 0.3
    );

    var quantizedDiffuse = vec3f(
        step(0.8, diffuse.r) * 0.8 + step(0.6, diffuse.r) * 0.6 + step(0.3, diffuse.r) * 0.3,
        step(0.8, diffuse.g) * 0.8 + step(0.6, diffuse.g) * 0.6 + step(0.3, diffuse.g) * 0.3,
        step(0.8, diffuse.b) * 0.8 + step(0.6, diffuse.b) * 0.6 + step(0.3, diffuse.b) * 0.3
    );

    var finalColor = quantizedDiffuse * quantizedLight;

    // draw outlines ---------------------------------------------

    let edge = calculateEdge(index, normal);
    
    // if edge detected, return black for the outline
    if (edge > 0.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0); 
    } else {
        return vec4<f32>(finalColor, 1.0);
    }
}