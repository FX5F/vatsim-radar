import { featureCollection, lineString, polygon, multiPolygon } from '@turf/helpers';
import { flattenEach } from '@turf/meta';
import union from '@turf/union';
import difference from '@turf/difference';
import intersect from '@turf/intersect';
import truncate from '@turf/truncate';
import kinks from '@turf/kinks';
import unkinkPolygon from '@turf/unkink-polygon';
import mergeRanges from 'merge-ranges';
import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, LineString, Point } from 'geojson';
import type { VatglassesSectorProperties } from './vatglasses';
import { H3Error } from 'h3';

import { transform } from 'ol/proj';
import lineIntersect from '@turf/line-intersect';
import * as polyclip from 'polyclip-ts';


/**
 * Rounds the coordinates of a Turf polygon feature to the specified number of decimal places.
 * @param feature The Turf polygon feature to round.
 * @param decimals The number of decimal places to round to.
 * @returns The modified Turf polygon feature with rounded coordinates.
 */
export function roundPolygonCoordinates(feature: TurfFeature<TurfPolygon | TurfMultiPolygon>, decimals: number = 0): TurfFeature<TurfPolygon | TurfMultiPolygon> {
    if (feature === null) return null;
    const factor = Math.pow(10, decimals);

    const roundCoordinates = (coordinates: number[][]) => {
        for (let i = 0; i < coordinates.length; i++) {
            coordinates[i][0] = Math.round(coordinates[i][0] * factor) / factor;
            coordinates[i][1] = Math.round(coordinates[i][1] * factor) / factor;
        }
        return coordinates;
    };

    if (feature.geometry.type === 'Polygon') {
        for (let i = 0; i < feature.geometry.coordinates.length; i++) {
            feature.geometry.coordinates[i] = roundCoordinates(feature.geometry.coordinates[i]);
        }
    }
    else if (feature.geometry.type === 'MultiPolygon') {
        for (let i = 0; i < feature.geometry.coordinates.length; i++) {
            for (let j = 0; j < feature.geometry.coordinates[i].length; j++) {
                feature.geometry.coordinates[i][j] = roundCoordinates(feature.geometry.coordinates[i][j]);
            }
        }
    }

    return feature;
}


function polyclipToTurfFeature(coordinates: number[][][], properties: object = {}): TurfFeature<TurfPolygon> {
    console.log(coordinates);
    const depth = coordinates.flat(2).some(Array.isArray) ? 3 : 2;
    if (depth === 2) {
        return polygon(coordinates, properties);
    }
    else {
        return multiPolygon(coordinates, properties);
    }
}


function removeDuplicateCoords(feature: TurfFeature<TurfPolygon | TurfMultiPolygon>): TurfFeature<TurfPolygon | TurfMultiPolygon> {
    const removeDuplicates = (coordinates: number[][]) => {
        return coordinates.filter((coord, index, self) => {
            if (index === 0) return true;
            const prevCoord = self[index - 1];
            return coord[0] !== prevCoord[0] || coord[1] !== prevCoord[1];
        });
    };

    if (feature.geometry.type === 'Polygon') {
        for (let i = 0; i < feature.geometry.coordinates.length; i++) {
            feature.geometry.coordinates[i] = removeDuplicates(feature.geometry.coordinates[i]);
        }
    }
    else if (feature.geometry.type === 'MultiPolygon') {
        for (let i = 0; i < feature.geometry.coordinates.length; i++) {
            for (let j = 0; j < feature.geometry.coordinates[i].length; j++) {
                feature.geometry.coordinates[i][j] = removeDuplicates(feature.geometry.coordinates[i][j]);
            }
        }
    }

    return feature;
}


/**
 * Finds the intersection points of two LineStrings.
 * @param line1 The first LineString.
 * @param line2 The second LineString.
 * @returns An array of intersection points.
 */
function findIntersectionPoints(line1: TurfFeature<LineString>, line2: TurfFeature<LineString>): TurfFeature<Point>[] {
    const intersections = lineIntersect(line1, line2);
    return intersections.features;
}

/**
 * Adds intersection points to a LineString.
 * @param line The LineString to add points to.
 * @param points The intersection points to add.
 * @returns The modified LineString with the intersection points added.
 */
function addPointsToLine(line: TurfFeature<LineString>, points: TurfFeature<Point>[]): TurfFeature<LineString> {
    const coordinates = line.geometry.coordinates;
    // Remove duplicate coordinates that are next to each other
    for (let i = coordinates.length - 1; i > 0; i--) {
        if (coordinates[i][0] === coordinates[i - 1][0] && coordinates[i][1] === coordinates[i - 1][1]) {
            coordinates.splice(i, 1);
        }
    }
    // const convertedPolygons3 = convertFeatureToLatLon(structuredClone(line));
    // console.log(JSON.stringify(featureCollection([convertedPolygons3])));

    // const convertedPolygons4 = structuredClone(points).map(convertFeatureToLatLon);
    // console.log(JSON.stringify(featureCollection([...convertedPolygons4, convertedPolygons3])));


    points.forEach(point => {
        const [x, y] = point.geometry.coordinates;
        let inserted = false;

        // Check if the point is already part of the line
        if (coordinates.some(coord => coord[0] === x && coord[1] === y)) {
            return;
        }

        for (let i = 0; i < coordinates.length - 1; i++) {
            const [x1, y1] = coordinates[i];
            const [x2, y2] = coordinates[i + 1];

            // Check if the intersection point lies on the segment between coordinates[i] and coordinates[i + 1]
            if (isPointOnSegment([x1, y1], [x2, y2], [x, y])) {
                coordinates.splice(i + 1, 0, [x, y]);
                // console.log('insert');
                // console.log(line);

                // const convertedPolygons3 = convertFeatureToLatLon(structuredClone(line));
                // // console.log(JSON.stringify(featureCollection([convertedPolygons3])));

                // const convertedPolygons4 = convertFeatureToLatLon(structuredClone(point));
                // console.log(JSON.stringify(featureCollection([convertedPolygons4, convertedPolygons3])));


                inserted = true;
                break;
            }
        }

        // If the point was not inserted, add it to the end (fallback)
        if (!inserted) {
            console.log('insertFALLBACK');


            // insertfailed = true;

            // const convertedPolygons3 = convertFeatureToLatLon(structuredClone(line));
            // // console.log(JSON.stringify(featureCollection([convertedPolygons3])));

            // const convertedPolygons4 = convertFeatureToLatLon(structuredClone(point));
            // console.log(JSON.stringify(featureCollection([convertedPolygons4, convertedPolygons3])));

            // for (let i = 0; i < coordinates.length - 1; i++) {
            //     const [x1, y1] = coordinates[i];
            //     const [x2, y2] = coordinates[i + 1];
            //     const tolerance = 0.01;

            //     console.log(transform(coordinates[i], 'EPSG:3857', 'EPSG:4326'));
            //     console.log(transform(coordinates[i + 1], 'EPSG:3857', 'EPSG:4326'));

            //     const crossProduct = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
            //     if (Math.abs(crossProduct) > tolerance) {
            //         console.log('crossProduct failed ' + Math.abs(crossProduct));
            //         continue;
            //     }

            //     const dotProduct = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
            //     if (dotProduct < 0) {
            //         console.log('dotProduct failed ' + dotProduct);
            //         continue;
            //     }

            //     const squaredLengthBA = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
            //     if (dotProduct > squaredLengthBA) {
            //         console.log('squaredLengthBA failed ' + squaredLengthBA);
            //         continue;
            //     }

            //     console.log('PASSED');
            //     break;
            // }


            // coordinates.splice(coordinates.length - 1, 0, [x, y]);
        }
    });

    return lineString(coordinates);
}

/**
 * Checks if a point lies on a segment with a given tolerance.
 * @param p1 The first point of the segment.
 * @param p2 The second point of the segment.
 * @param p The point to check.
 * @param tolerance The tolerance for the check.
 * @returns True if the point lies on the segment, false otherwise.
 */
const isPointOnSegment = (p1: number[], p2: number[], p: number[], tolerance: number = 0.01) => { // 1e-6, Number.EPSILON
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const [x, y] = p;

    const crossProduct = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
    if (Math.abs(crossProduct) > tolerance) return false;

    const dotProduct = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
    if (dotProduct < 0) return false;

    const squaredLengthBA = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (dotProduct > squaredLengthBA) return false;

    return true;
};

/**
 * Modifies an array of Turf polygon features by finding and adding intersection points.
 * @param polygons The array of Turf polygon features to modify.
 * @returns The modified array of Turf polygon features.
 */
function modifyPolygonsWithIntersections(polygons: TurfFeature<TurfPolygon | TurfMultiPolygon>[]): TurfFeature<TurfPolygon | TurfMultiPolygon>[] {
    const modifiedPolygons: TurfFeature<TurfPolygon | TurfMultiPolygon>[] = [];

    for (let i = 0; i < polygons.length; i++) {
        if (insertfailed) break;
        const polygon1 = removeDuplicateCoords(polygons[i]);
        const line1 = polygonToLineString(structuredClone(polygon1));
        let intersectionPoints: TurfFeature<Point>[] = [];

        for (let j = 0; j < polygons.length; j++) {
            if (i === j) continue;

            const polygon2 = polygons[j];
            const line2 = polygonToLineString(polygon2);

            // Find intersection points between the current polygon and all other polygons
            // intersectionPoints = intersectionPoints.concat(findIntersectionPoints(line1, line2));
            intersectionPoints = intersectionPoints.concat(findIntersectionPoints(line1, line2));
            // if(i === 15 && j === 27) {
            //     console.log('15-27',intersectionPoints);
            //     console.log(JSON.stringify(intersectionPoints));

            //     const uniquePointsFeatureCollection = featureCollection(structuredClone(intersectionPoints).map(convertFeatureToLatLon));
            //     console.log(JSON.stringify(uniquePointsFeatureCollection));


            //     const uniquePointsFeatureCollection2 = featureCollection([structuredClone(line1),structuredClone(line2)].map(convertFeatureToLatLon));
            //     console.log(JSON.stringify(uniquePointsFeatureCollection2));

            //     console.log('intersect',lineIntersect(convertFeatureToLatLon(structuredClone(line1)), convertFeatureToLatLon(structuredClone(line2))))
            // }
        }

        // if(i === 15){
        //     console.log('15-1',intersectionPoints);
        // }

        // Ensure intersection points are unique
        intersectionPoints = intersectionPoints.filter((point, index, self) => index === self.findIndex(p => p.geometry.coordinates[0] === point.geometry.coordinates[0] && p.geometry.coordinates[1] === point.geometry.coordinates[1]));

        // if(i === 26){
        //     console.log('26-2',JSON.stringify(intersectionPoints));
        // }

        // if(i === 26){
        //     console.log('26-2',structuredClone(line1))
        // }

        // Add all collected intersection points to the current polygon
        const modifiedLine1 = addPointsToLine(line1, intersectionPoints);
        const modifiedPolygon1 = lineStringToPolygon(modifiedLine1);
        modifiedPolygon1.properties = structuredClone(polygon1.properties);
        modifiedPolygon1.properties.id = i;


        modifiedPolygons.push(modifiedPolygon1);
    }

    return modifiedPolygons;
}

/**
 * Converts a Turf polygon feature to a LineString feature.
 * @param polygon The Turf polygon feature to convert.
 * @returns The converted LineString feature.
 */
function polygonToLineString(polygon: TurfFeature<TurfPolygon | TurfMultiPolygon>): TurfFeature<LineString> {
    const coordinates = polygon.geometry.type === 'Polygon'
        ? polygon.geometry.coordinates[0]
        : polygon.geometry.coordinates[0][0];
    return lineString(coordinates);
}

/**
 * Converts a Turf LineString feature to a polygon feature.
 * @param line The Turf LineString feature to convert.
 * @returns The converted polygon feature.
 */
function lineStringToPolygon(line: TurfFeature<LineString>): TurfFeature<TurfPolygon> {
    const coordinates = [line.geometry.coordinates];
    return polygon(coordinates);
}


const insertfailed = false;
export function splitSectors(sectors: TurfFeature<TurfPolygon>[]) {
    for (let i = 0; i < sectors.length; i++) {
        const currentPolygon = sectors[i];
        currentPolygon.properties.id = i;
    }

    // const convertedPolygons4 = structuredClone(sectors).map(convertFeatureToLatLon);
    // console.log(JSON.stringify(featureCollection(convertedPolygons4)));

    // sectors = sectors.slice(0, 2);
    // sectors.splice(52, 1);
    for (let i = sectors.length - 1; i >= 0; i--) {
        const currentPolygon = sectors[i];
        removeDuplicateCoords(roundPolygonCoordinates(currentPolygon));

        let kinks_result = kinks(currentPolygon);
        if (kinks_result.features.length > 0) {
            console.log('kink removing id; ' + i);
            sectors.splice(i, 1);
            // const result = unkinkPolygon(currentPolygon);
            // console.log(i,kinks_result);
            // console.log(JSON.stringify(featureCollection([convertFeatureToLatLon(structuredClone(result))])));
        }
    }

    // const convertedPolygons2 = structuredClone(sectors.map(convertFeatureToLatLon));
    // console.log(JSON.stringify(featureCollection(convertedPolygons2)));

    // ADD INTERSECTIONS
    const modifiedPolygons = modifyPolygonsWithIntersections(sectors);
    modifiedPolygons.map(polygon => removeDuplicateCoords(roundPolygonCoordinates(polygon, 0)));
    sectors = modifiedPolygons;

    // const convertedPolygons1 = structuredClone(sectors).map(convertFeatureToLatLon);
    // console.log(JSON.stringify(featureCollection(convertedPolygons1)));


    // const allCoordinates = new Set<string>();
    // sectors.forEach(sector => {
    //     const coordinates = sector.geometry.type === 'Polygon'
    //         ? sector.geometry.coordinates.flat()
    //         : sector.geometry.coordinates.flat(2);
    //     coordinates.forEach(coord => allCoordinates.add(coord.join(',')));
    // });

    // const uniquePoints = Array.from(allCoordinates).map(coord => {
    //     const [lng, lat] = coord.split(',').map(Number);
    //     return {
    //         type: 'Feature',
    //         geometry: {
    //             type: 'Point',
    //             coordinates: [lng, lat]
    //         },
    //         properties: {}
    //     };
    // });

    // const uniquePointsFeatureCollection = featureCollection(uniquePoints.map(convertFeatureToLatLon));
    // console.log(JSON.stringify(uniquePointsFeatureCollection));


    //

    // console.log(JSON.stringify(featureCollection(sectors)));



    let resultPolygons: TurfFeature<TurfPolygon>[] = [];

    let currentPolygon2 = null;
    let otherPolygon = null;
    try {
        for (let i = 0; i < sectors.length; i++) {
            const currentPolygon = sectors[i];
            // roundPolygonCoordinates(currentPolygon);
            currentPolygon2 = currentPolygon;
            const initPolygon = structuredClone(currentPolygon);
            let offset = 0;
            if (currentPolygon.properties?.max % 10 !== 0 && currentPolygon.properties?.max % 10 !== 5 && currentPolygon.properties?.max !== 999) {
                offset = 1;
            }
            // currentPolygon.properties.altrange = [[currentPolygon.properties?.min, currentPolygon.properties?.max % 10 === 4 ? currentPolygon.properties?.max + 1 : currentPolygon.properties?.max]];
            if (currentPolygon.properties) currentPolygon.properties.altrange = [[currentPolygon.properties?.min, currentPolygon.properties?.max + offset]];
            // We do the +1, because often the maximum is ending with 4, for sectors which go to FL315. But we need to have a matching min and max value for the mergeRanges to be working.
            if (!resultPolygons.length) {
                if (currentPolygon.geometry.coordinates.some(ring => ring.some(coord => isNaN(coord[0]) || isNaN(coord[1])))) {
                    console.error('Current polygon has NaN coordinates:', currentPolygon);
                    continue;
                }
                resultPolygons.push(currentPolygon);
                continue;
            }
            const newResultPolygons: TurfFeature<TurfPolygon>[] = [];

            let remainingOfCurrentPolygon: TurfFeature<TurfPolygon | TurfMultiPolygon> | null = currentPolygon;
            for (const resultPolygon of resultPolygons) {
                if (!remainingOfCurrentPolygon) {
                    if (resultPolygon.geometry.coordinates.some(ring => ring.some(coord => isNaN(coord[0]) || isNaN(coord[1])))) {
                        console.error('4Current polygon has NaN coordinates:', currentPolygon);
                    }
                    newResultPolygons.push(resultPolygon);
                    continue;
                }
                otherPolygon = remainingOfCurrentPolygon;


                // const allPolygons: number[][][] = [];
                // flattenEach(remainingOfCurrentPolygon, function(currentFeature) {
                //     if (currentFeature.geometry.type === 'Polygon') {
                //         allPolygons.push(currentFeature.geometry.coordinates);
                //     } else if (currentFeature.geometry.type === 'MultiPolygon') {
                //         currentFeature.geometry.coordinates.forEach(polygon => allPolygons.push(polygon));
                //     }
                // });

                // remainingOfCurrentPolygon = {
                //     type: 'Feature',
                //     geometry: {
                //         type: 'MultiPolygon',
                //         coordinates: allPolygons
                //     },
                //     properties: remainingOfCurrentPolygon.properties
                // };


                // console.log(resultPolygon);
                // console.log(remainingOfCurrentPolygon);


                // console.log('INTERSECTION')
                // console.log(remainingOfCurrentPolygon.geometry.coordinates);
                // console.log(resultPolygon.geometry.coordinates);

                // let intersection = polyclipToTurfFeature(polyclip.intersection(remainingOfCurrentPolygon.geometry.coordinates, resultPolygon.geometry.coordinates))
                const intersection = (intersect(featureCollection([remainingOfCurrentPolygon, resultPolygon])));
                const hasFloatCoordinates = (feature: TurfFeature<TurfPolygon | TurfMultiPolygon>): boolean => {
                    const coordinates = feature.geometry.type === 'Polygon'
                        ? feature.geometry.coordinates.flat()
                        : feature.geometry.coordinates.flat(2);
                    return coordinates.some(coord => coord.some(c => !Number.isInteger(c)));
                };

                if (intersection && hasFloatCoordinates(intersection)) {
                    console.log('Intersection has float coordinates:', i);
                    // console.log('Intersection has float coordinates:', structuredClone(intersection));
                    // console.log('input id: ', i);
                    // console.log(JSON.stringify(convertFeatureToLatLon(intersection)));
                    // console.log('Current remainingOfCurrentPolygon:', structuredClone(remainingOfCurrentPolygon));
                    // console.log(JSON.stringify(convertFeatureToLatLon(remainingOfCurrentPolygon)));
                    // console.log('Other resultPolygon:', structuredClone(resultPolygon));
                    // console.log(JSON.stringify(convertFeatureToLatLon(resultPolygon)));
                }
                // console.log(intersection);

                if (intersection) {
                    // let difference1 = polyclipToTurfFeature(polyclip.difference(remainingOfCurrentPolygon.geometry.coordinates, resultPolygon.geometry.coordinates))

                    // console.log('difference1');
                    // console.log(difference1);

                    // let difference2 = polyclipToTurfFeature(polyclip.difference(resultPolygon.geometry.coordinates, remainingOfCurrentPolygon.geometry.coordinates))

                    // console.log('difference2');
                    // console.log(difference2);

                    const difference1 = (difference(featureCollection([remainingOfCurrentPolygon, resultPolygon])));
                    const difference2 = (difference(featureCollection([resultPolygon, remainingOfCurrentPolygon])));


                    if (difference1 && hasFloatCoordinates(difference1)) {
                        console.log('+++++++difference1 has float coordinates:', differencei1);
                        // console.log('+++++++difference1 has float coordinates:', difference1);
                        // console.log('input id: ', i);
                        // console.log(JSON.stringify(convertFeatureToLatLon(difference1)));
                        // console.log('Current remainingOfCurrentPolygon:', remainingOfCurrentPolygon);
                        // console.log(JSON.stringify(convertFeatureToLatLon(remainingOfCurrentPolygon)));
                        // console.log('Other resultPolygon:', resultPolygon);
                        // console.log(JSON.stringify(convertFeatureToLatLon(resultPolygon)));
                    }

                    if (difference2 && hasFloatCoordinates(difference2)) {
                        console.log('-------difference2 has float coordinates:', i);
                        // console.log('-------difference2 has float coordinates:', difference2);
                        // console.log('input id: ', i);
                        // console.log('Current remainingOfCurrentPolygon:', remainingOfCurrentPolygon);
                        // console.log(JSON.stringify(convertFeatureToLatLon(remainingOfCurrentPolygon)));
                        // console.log('Other resultPolygon:', resultPolygon);
                        // console.log(JSON.stringify(convertFeatureToLatLon(resultPolygon)));
                    }

                    if (difference1) {
                        difference1.properties = structuredClone(difference1.properties);
                        remainingOfCurrentPolygon = difference1;
                    }
                    else {
                        remainingOfCurrentPolygon = null;
                    }

                    if (difference2) {
                        flattenEach(difference2, function(currentFeature) {
                            currentFeature.properties = structuredClone(resultPolygon.properties);

                            if (currentFeature.geometry.coordinates.some(ring => ring.some(coord => isNaN(coord[0]) || isNaN(coord[1])))) {
                                console.error('3Current polygon has NaN coordinates:', currentPolygon);
                            }

                            newResultPolygons.push(currentFeature as TurfFeature<TurfPolygon>);
                        });
                    }

                    flattenEach(intersection, function(currentFeature) {
                        currentFeature.properties = structuredClone(resultPolygon.properties);
                        if (currentFeature.properties) currentFeature.properties.altrange = mergeRanges([...structuredClone(resultPolygon.properties?.altrange) ?? [], ...structuredClone(currentPolygon.properties?.altrange) ?? []]);

                        if (currentFeature.geometry.coordinates.some(ring => ring.some(coord => isNaN(coord[0]) || isNaN(coord[1])))) {
                            console.error('2Current polygon has NaN coordinates:', currentPolygon);
                        }
                        newResultPolygons.push(currentFeature as TurfFeature<TurfPolygon>);
                    });
                }
                else {
                    if (resultPolygon.geometry.coordinates.some(ring => ring.some(coord => isNaN(coord[0]) || isNaN(coord[1])))) {
                        console.error('1Current polygon has NaN coordinates:', currentPolygon);
                    }
                    newResultPolygons.push(resultPolygon);
                }
            }

            if (remainingOfCurrentPolygon) {
                flattenEach(remainingOfCurrentPolygon, function(currentFeature) {
                    currentFeature.properties = structuredClone(currentPolygon.properties);
                    newResultPolygons.push(currentFeature as TurfFeature<TurfPolygon>);
                });
            }

            resultPolygons = newResultPolygons;
        }
    }
    catch (error) {
        console.log('split failed');
        // console.log(error);
        // console.log(currentPolygon2);
        // console.log(otherPolygon);
    }


    // // Assuming resultPolygons is an array of TurfFeature<TurfPolygon>
    // const convertedPolygons = resultPolygons.map(convertFeatureToLatLon);
    // console.log(JSON.stringify(featureCollection(convertedPolygons)));


    return resultPolygons;
}

export function combineSectors(sectors: TurfFeature<TurfPolygon>[]) {
    const groupedSectors: { [index: string]: TurfFeature<TurfPolygon>[] } = {};

    for (const sector of sectors) {
        if (sector.properties) {
            for (const altrange of sector.properties.altrange) {
                const joinedAltrange = altrange.join('-');
                if (groupedSectors[joinedAltrange]) {
                    groupedSectors[joinedAltrange].push(sector);
                }
                else {
                    groupedSectors[joinedAltrange] = [sector];
                }
            }
        }
    }

    const combinedGroupSectors = [];
    for (const altrange in groupedSectors) {
        const sectors = groupedSectors[altrange];
        if (sectors.length === 0) {
            continue;
        }
        if (sectors.length === 1) {
            const combined = sectors[0];
            const properties = combined.properties as VatglassesSectorProperties;
            [properties.min, properties.max] = altrange.split('-').map(Number);

            combinedGroupSectors.push(combined);
            continue;
        }
        try {
            // const combined = union(truncate(featureCollection(sectors), { mutate: true }));
            const combined = union((featureCollection(sectors)));
            if (combined) {
                flattenEach(combined, function(currentFeature) {
                    currentFeature.properties = structuredClone(sectors[0].properties);
                    const properties = currentFeature.properties as VatglassesSectorProperties;
                    [properties.min, properties.max] = altrange.split('-').map(Number);

                    combinedGroupSectors.push(currentFeature as TurfFeature<TurfPolygon>);
                });
            }
        }
        catch (error) {
            console.log('combine failed');
            console.log(error);
            // console.log(featureCollection(sectors));
        }
    }

    // // Assuming resultPolygons is an array of TurfFeature<TurfPolygon>
    // const convertedPolygons = combinedGroupSectors.map(convertFeatureToLatLon);

    // console.log(JSON.stringify(featureCollection(convertedPolygons)));

    return combinedGroupSectors;
}


/**
     * Converts coordinates from EPSG:3857 to EPSG:4326.
     * @param coordinates The coordinates to convert.
     * @returns The converted coordinates.
     */
function convertCoordinatesToLatLon(coordinates: number[][]): number[][] {
    return coordinates.map(coord => transform(coord, 'EPSG:3857', 'EPSG:4326'));
}

/**
     * Converts the coordinates of a Turf polygon feature from EPSG:3857 to EPSG:4326.
     * @param feature The Turf polygon feature to convert.
     * @returns The converted Turf polygon feature.
     */
function convertFeatureToLatLon(feature: TurfFeature<TurfPolygon | TurfMultiPolygon | LineString | Point>): TurfFeature<TurfPolygon | TurfMultiPolygon | LineString | Point> {
    if (feature.geometry.type === 'Polygon') {
        feature.geometry.coordinates = feature.geometry.coordinates.map(ring => convertCoordinatesToLatLon(ring));
    }
    else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates = feature.geometry.coordinates.map(polygon => polygon.map(ring => convertCoordinatesToLatLon(ring)));
    }
    else if (feature.geometry.type === 'LineString') {
        feature.geometry.coordinates = convertCoordinatesToLatLon(feature.geometry.coordinates);
    }
    else if (feature.geometry.type === 'Point') {
        feature.geometry.coordinates = transform(feature.geometry.coordinates, 'EPSG:3857', 'EPSG:4326');
    }
    return feature;
}
