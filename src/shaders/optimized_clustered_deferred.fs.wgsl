// File: shaders/optimized_clustered_deferred.fs.wgsl

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,  
    @location(1) nor: vec3f,  
    @location(2) uv: vec2f,   
};

struct FragmentOutput {
    @location(0) data: vec4u
}

fn octWrap(v: vec2f) -> vec2f {
    return (1.0 - abs(v.yx)) * vec2f(select(-1.0, 1.0, v.x >= 0.0), select(-1.0, 1.0, v.y >= 0.0));
}

fn encode(n: vec3f) -> vec2f {
    var nor = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    nor = select(octWrap(nor), nor, n.z >= 0.0);
    return nor * 0.5 + 0.5;
}


@fragment
fn main(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;

    let diffColor = textureSample(diffuseTex, diffuseTexSampler, input.uv);
    if (diffColor.a < 0.5) {
        discard;
    }

    let packedDiffuse = pack4x8unorm(vec4f(diffColor.rgb, 1.0));
    let encodedNormal = encode(input.nor);
    let packedNormal = pack2x16unorm(vec2f(encodedNormal.x, encodedNormal.y));
    let packedDepth = bitcast<u32>(input.pos.z);
    output.data = vec4u(packedDiffuse, packedNormal, packedDepth, 1u);

    return output;
}

