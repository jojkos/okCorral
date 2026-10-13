import type { Team } from './types.js';

export interface CharacterDesign {
  id: number;
  name: string;
  description: string;
  sprite: string;
  coat: string;
  dark: string;
  light: string;
  skin: string;
}

const design = (id: number, name: string, description: string, coat: string, dark: string, light: string, skin = '#d9a87c'): CharacterDesign => ({
  id, name, description, coat, dark, light, skin,
  sprite: id === 0 ? '/characters/gunslingers.webp' : `/characters/gunslingers-${id}.png`,
});

/** Cosmetics only. Indices deliberately match across teams and survive a side switch. */
export const CHARACTER_DESIGNS: Record<Team, readonly CharacterDesign[]> = {
  sheriffs: [
    design(0, 'Marshal', 'The classic blue duster and gold star.', '#247eab', '#174963', '#76c8dd'),
    design(1, 'Ironwood', 'Ivory hat, cobalt lapels and a silver-flecked beard.', '#284971', '#172d48', '#367fc0', '#955f3e'),
    design(2, 'Rose', 'Copper hair, a blue riding coat and a determined gaze.', '#417ba7', '#29465f', '#98c6de', '#e5b78e'),
    design(3, 'Ranger', 'Weathered grey coat, blue waistcoat and a full beard.', '#777b79', '#3e484e', '#448cb4'),
    design(4, 'Doc', 'Round spectacles, a bowler hat and a blue brocade vest.', '#373d49', '#242938', '#6998c3', '#e4bca0'),
    design(5, 'June', 'Long braid, a sand duster and a bright blue scarf.', '#b39b6b', '#715739', '#448ebe', '#8c583b'),
    design(6, 'Captain', 'A navy cavalry coat with brass buttons.', '#254c7d', '#18344f', '#6fa6d5'),
    design(7, 'Rio', 'Blue woven shoulders, leather trim and a silver badge.', '#437a9c', '#28495e', '#92c7db', '#b57b53'),
  ],
  outlaws: [
    design(0, 'Rattler', 'The red-coated original with a black hat.', '#b86248', '#663931', '#f0b398'),
    design(1, 'Coyote', 'A sand duster, red scarf and a loaded bandolier.', '#ae9265', '#6b5036', '#c44335', '#bc865e'),
    design(2, 'Viper', 'Black hair, a scarlet riding coat and a low hat.', '#a93438', '#582a30', '#e07765', '#d99a72'),
    design(3, 'Gravedigger', 'A black duster, grey beard and a blood-red shirt.', '#353435', '#1f2027', '#b54337', '#be997e'),
    design(4, 'Gambler', 'A pinstriped coat, red waistcoat and a curled moustache.', '#44414c', '#28262f', '#b54b46', '#e5ba98'),
    design(5, 'Red Jack', 'Ginger beard, pale hat and red leather lapels.', '#815537', '#483329', '#bb4936', '#e0aa82'),
    design(6, 'Sombra', 'A charcoal coat, black braid and a vivid red neckerchief.', '#46404a', '#282733', '#cc493f', '#855136'),
    design(7, 'Diablo', 'Red woven shoulders, brass cartridges and a desert hat.', '#a74736', '#63382b', '#de8b63', '#b57b53'),
  ],
};

export function getCharacterDesign(team: Team, appearance = 0): CharacterDesign {
  return CHARACTER_DESIGNS[team][Number.isInteger(appearance) && appearance >= 0 && appearance < 8 ? appearance : 0];
}
