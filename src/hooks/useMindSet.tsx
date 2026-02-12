import { isValidArray } from 'nhb-toolbox';
import type { Maybe } from 'nhb-toolbox/types';
import { useEffect, useState } from 'react';

// type ExtractArrayFields<T> = {
// 	[K in keyof T]: T[K] extends string[] ? K : never;
// }[keyof T];

/**
 * Custom hook to manage a mindset value, which can be an array of strings or undefined.
 * It converts the array into a single string joined by a specified separator.
 *
 * @param mindsetValue - The initial mindset value, which can be an array of strings or undefined.
 * @param joiner - The string used to join the array elements (default is `', '`).
 * @returns A tuple containing the current field value and a setter function to update it.
 */
export function useMindSet(mindsetValue: Maybe<string[]>, joiner = ', ') {
	const [fieldValue, setFieldValue] = useState('');

	useEffect(() => {
		if (isValidArray<string>(mindsetValue)) {
			setFieldValue(mindsetValue.join(joiner));
		}
	}, [joiner, mindsetValue]);

	return [fieldValue, setFieldValue] as const;
}
