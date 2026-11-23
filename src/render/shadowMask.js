import * as THREE from 'three';

/**
 * Writes the sun's shadow factor into the colour target's alpha (1 = lit,
 * 0 = full shadow) for every opaque lit material, by patching three's
 * shader chunks once at startup (before any material compiles). The ASCII
 * pass reads it to draw shadows the same dark tone on every surface,
 * instead of "a bit darker than whatever is underneath".
 */
let done = false;
export function installShadowMask() {
  if (done) return;
  done = true;
  const C = THREE.ShaderChunk;
  C.common += '\nfloat sunShadow = 1.0;\n';

  const dir = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  if (!C.lights_fragment_begin.includes(dir)) throw new Error('shadowMask: three.js shadow chunk changed');
  C.lights_fragment_begin = C.lights_fragment_begin.replace(dir,
    'float dirShadow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n' +
    '\t\tdirectLight.color *= dirShadow;\n\t\tsunShadow = min( sunShadow, dirShadow );');

  const out = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
  if (!C.opaque_fragment.includes(out)) throw new Error('shadowMask: three.js output chunk changed');
  C.opaque_fragment = C.opaque_fragment.replace(out,
    '#ifdef OPAQUE\ngl_FragColor = vec4( outgoingLight, sunShadow );\n#else\n' + out + '\n#endif');
}
